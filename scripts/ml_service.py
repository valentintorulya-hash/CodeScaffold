"""
Persistent FastAPI ML-service wrapper around ml_backend.py

Eliminates per-request Python process spawn overhead by keeping
TensorFlow/sklearn/statsmodels loaded in a long-running process.

Guardrails:
- Seeds (random, numpy, tf) are reset before every /analyze and /forecast call
- tf.keras.backend.clear_session() is called before training
- asyncio.Lock serializes TF operations (no concurrent GPU/CPU races)
- Single uvicorn worker enforced at startup (--workers 1)
"""

import asyncio
import json
import logging
import os
import random
import sys
import time
import traceback
from typing import Any

# Suppress TF noise before importing
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

import numpy as np
import tensorflow as tf
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

# Import analyze from ml_backend (same directory)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ml_backend  # noqa: E402

app = FastAPI(title="ML Service", version="1.0.0")
logger = logging.getLogger("ml_service")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

# Global lock: serializes all TF operations to prevent race conditions
_tf_lock = asyncio.Lock()

SEED = 42


def _reset_seeds() -> None:
    """Reset all random seeds for deterministic results on every request."""
    random.seed(SEED)
    np.random.seed(SEED)
    tf.random.set_seed(SEED)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze")
async def analyze(request: Request) -> JSONResponse:
    """
    Run full ML analysis pipeline.

    Expects JSON body with:
      - close: number[]
      - dates: string[]
      - params: { look_back, lstm_units, epochs, batch_size, forecast_block }
      - days: number (default 30)
      - future_dates: string[] (optional)
    """
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Body must be a JSON object")

    close = payload.get("close", [])
    if not close or not isinstance(close, list):
        raise HTTPException(status_code=400, detail="Missing or empty 'close' array")

    async with _tf_lock:
        _reset_seeds()
        start = time.perf_counter()
        try:
            result = ml_backend.analyze(payload)
        except ValueError as exc:
            return JSONResponse(
                status_code=400,
                content={"success": False, "error": str(exc)},
            )
        except Exception as exc:
            logger.error("analyze failed: %s\n%s", exc, traceback.format_exc())
            return JSONResponse(
                status_code=500,
                content={"success": False, "error": str(exc)},
            )
        elapsed = time.perf_counter() - start
        logger.info("analyze completed in %.2fs", elapsed)

    return JSONResponse(content=result)


@app.post("/forecast")
async def forecast(request: Request) -> JSONResponse:
    """
    Run forecast-only pipeline (reuses analyze internally, returns only forecast).

    Expects same payload as /analyze.
    """
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Body must be a JSON object")

    close = payload.get("close", [])
    if not close or not isinstance(close, list):
        raise HTTPException(status_code=400, detail="Missing or empty 'close' array")

    async with _tf_lock:
        _reset_seeds()
        start = time.perf_counter()
        try:
            result = ml_backend.analyze(payload)
        except ValueError as exc:
            return JSONResponse(
                status_code=400,
                content={"success": False, "error": str(exc)},
            )
        except Exception as exc:
            logger.error("forecast failed: %s\n%s", exc, traceback.format_exc())
            return JSONResponse(
                status_code=500,
                content={"success": False, "error": str(exc)},
            )
        elapsed = time.perf_counter() - start
        logger.info("forecast completed in %.2fs", elapsed)

    return JSONResponse(content={"success": True, "forecast": result["forecast"]})


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("ML_SERVICE_PORT", "8000"))
    logger.info("Starting ML service on port %d (single worker)", port)
    uvicorn.run(
        "ml_service:app",
        host="127.0.0.1",
        port=port,
        workers=1,  # MUST be 1: TF is not fork-safe
        log_level="info",
    )
