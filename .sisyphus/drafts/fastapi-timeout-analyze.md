# Draft: FastAPI timeout after "Запустить анализ"

## Problem Statement (from user)
- After clicking the UI button "Запустить анализ", the FastAPI side eventually "falls".
- After some time, server console shows a timeout message and then a switch/fallback to `python[analyze-mode]`.

## Repo Signals (observed)
- UI trigger exists: `src/app/page.tsx` contains button text "Запустить анализ" and calls `handleRunAnalysis`.
- Next.js ML API route: `src/app/api/ml/route.ts`.
  - Supports FastAPI service (`ML_SERVICE_URL` default `http://127.0.0.1:8000`).
  - Has client-side timeout for FastAPI requests: `ML_SERVICE_TIMEOUT_MS` default `1_800_000` (clamped `60_000..3_600_000`).
  - Has explicit fallback to spawning python: logs warnings like:
    - `[ML Route] FastAPI call failed (...), falling back to pythonExec`
    - `[ML Route] FastAPI unavailable, falling back to pythonExec`
- Python services exist:
  - `scripts/ml_service.py` (FastAPI + uvicorn, workers=1, `/health`, `/analyze`, `/forecast`, serializes TF work via `asyncio.Lock`).
  - `scripts/ml_backend.py` (heavy compute: LSTM training + ARIMA fitting, likely >30s).

## Startup / Orchestration Scripts (observed)
- Windows dev launcher: `start.bat`
  - Starts `scripts/ml_service.py` in background and waits up to ~30s for `http://127.0.0.1:8000/health`.
  - If health never returns ok within the wait loop: prints warning that "FastAPI fallback to Python spawn will be used".
- Linux/prod orchestrator: `.zscripts/start.sh`
  - Runs `python3 ./scripts/ml_service.py &`.
  - Waits up to 30s for `/health` then continues even if not ready, explicitly noting "fallback на Python spawn".

## Detailed Flow Notes (from code reading)
- `src/app/api/ml/route.ts` decides FastAPI availability via `GET ${ML_SERVICE_URL}/health` with `AbortSignal.timeout(3000)`.
- If `/health` is slow/unresponsive, the route treats FastAPI as offline and immediately executes python subprocess fallback.
- `scripts/ml_service.py` executes CPU-heavy `ml_backend.analyze(payload)` directly inside an `async def` handler.
  - This is a likely cause of the service becoming unresponsive to `/health` while analysis is running.
  - Because `_tf_lock` serializes, any second request waits; but more importantly, CPU-bound code blocks uvicorn event loop.

## Working Hypothesis
- The "switch" to python is the intended fallback path in `src/app/api/ml/route.ts` when FastAPI is considered offline or its call fails.
- Most probable trigger (given current code): during `/analyze`, FastAPI event loop is blocked by CPU-bound `ml_backend.analyze`, so `/health` times out (3s) and Next.js immediately treats the service as unavailable → runs python subprocess.
- Secondary triggers to confirm with logs:
  - Proxy timeout (Caddy) causing client disconnect and abort cascade.
  - Gunicorn worker timeout (only if FastAPI is deployed behind gunicorn; not shown in start scripts).

## Open Questions
- Exact log line(s) that appear when it times out / switches mode (copy/paste needed).
- How the stack is started in your failing environment:
  - `start.bat`? `.zscripts/start.sh`? `uvicorn` directly? `gunicorn`? docker-compose?
- Typical analysis duration and whether UI can wait (single request) or should move to async job + polling/status.

## Scope Boundaries (tentative)
- INCLUDE: prevent timeouts/restarts during analysis; keep UI "run analysis" functional; preserve current analysis math unless explicitly requested.
- EXCLUDE (unless requested): redesign of ML algorithms; large UI redesign.

## Active Research
- Explore task (Next.js ML route flow + timeout points): `bg_3c906c6b`.
- Explore task (python services + 'analyze-mode' + timeouts): `bg_61289687`.
