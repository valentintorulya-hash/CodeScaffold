import { spawn } from "node:child_process";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// ── Feature flags ───────────────────────────────────────────────────────────
const USE_FASTAPI_SERVICE = process.env.USE_FASTAPI_SERVICE !== "false"; // default: true
const ALLOW_PYTHON_FALLBACK = process.env.ALLOW_PYTHON_FALLBACK !== "false"; // default: true
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://127.0.0.1:8000";
const ML_SERVICE_TIMEOUT_MS = clampInt(Number(process.env.ML_SERVICE_TIMEOUT_MS || 1_800_000), 60_000, 3_600_000);

type MlAction =
  | "healthCheck"
  | "getDataPreview"
  | "trainModels"
  | "runFullAnalysis"
  | "makePredictions"
  | "analyzeStationarity"
  | "forecastFuture";

interface MlCache {
  close: number[];
  dates: string[];
  params: {
    look_back: number;
    lstm_units: [number, number];
    epochs: number;
    batch_size: number;
    forecast_block: number;
  };
  predictions: {
    dates: string[];
    actual: number[];
    arima: number[];
    lstm: number[];
    hybrid: number[];
  };
  stationarity: {
    adf: { test_statistic: number; p_value: number; is_stationary: boolean; interpretation: string };
    kpss: { test_statistic: number; p_value: number; is_stationary: boolean };
    stationarity_type: string;
  };
  forecast30: {
    dates: string[];
    hybrid: number[];
    arima: number[];
    conf_int_lower: number[];
    conf_int_upper: number[];
  } | null;
  walk_forward: unknown;
  realism_metrics: unknown;
}

let latestAnalysis: MlCache | null = null;

// ── TTL Cache for MOEX data ─────────────────────────────────────────────────
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const moexCache = new Map<string, CacheEntry<{ dates: string[]; close: number[] }>>();
const moexInFlight = new Map<string, Promise<{ dates: string[]; close: number[] }>>();
const MOEX_CACHE_TTL_MS = 120_000; // 2 minutes
const MOEX_PAGE_STEP = 100;
const MOEX_MAX_START = 20_000;
const MOEX_FETCH_CONCURRENCY = 4;
const MOEX_PAGE_TIMEOUT_MS = 15_000;

let healthCacheEntry: CacheEntry<boolean> | null = null;
const HEALTH_CACHE_TTL_MS = 300_000; // 5 minutes

function toIsoDate(date: string) {
  return date.slice(0, 10);
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function parseIsoDateUtc(date: string) {
  const [year, month, day] = date.split("-").map((token) => Number(token));
  if (!year || !month || !day) {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  return new Date(Date.UTC(year, month - 1, day));
}

function buildTradingDates(lastTradingDate: string | undefined, days: number) {
  const targetDays = clampInt(days, 1, 365);
  const cursor = lastTradingDate
    ? parseIsoDateUtc(lastTradingDate)
    : new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));

  const dates: string[] = [];
  while (dates.length < targetDays) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const dayOfWeek = cursor.getUTCDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      continue;
    }

    dates.push(cursor.toISOString().slice(0, 10));
  }

  return dates;
}

function rollingAverage(values: number[], window = 5) {
  const out: number[] = [];
  for (let i = 0; i < values.length; i += 1) {
    const start = Math.max(0, i - window + 1);
    const chunk = values.slice(start, i + 1);
    const avg = chunk.reduce((sum, value) => sum + value, 0) / chunk.length;
    out.push(Number(avg.toFixed(4)));
  }
  return out;
}

// ── MOEX fetcher with TTL cache + in-flight dedup + bounded concurrency ─────
async function fetchMoexPage(baseUrl: string, from: string, till: string, start: number) {
  const url = `${baseUrl}?from=${from}&till=${till}&interval=24&start=${start}`;
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(MOEX_PAGE_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`MOEX error: ${response.status}`);
  }

  const payload = (await response.json()) as {
    candles?: { columns?: string[]; data?: (number | string)[][] };
  };

  const columns = payload.candles?.columns || [];
  const rows = payload.candles?.data || [];

  if (rows.length === 0) {
    return { rows, pageParsed: [] as { date: string; close: number }[] };
  }

  const closeIdx = columns.indexOf("close");
  const beginIdx = columns.indexOf("begin");
  if (closeIdx < 0 || beginIdx < 0) {
    throw new Error("MOEX candles payload is invalid");
  }

  const pageParsed = rows
    .map((row) => {
      const closeRaw = row[closeIdx];
      const beginRaw = row[beginIdx];
      const close = typeof closeRaw === "number" ? closeRaw : Number(closeRaw);
      const begin = String(beginRaw);
      return { date: toIsoDate(begin), close };
    })
    .filter((item) => Number.isFinite(item.close));

  return { rows, pageParsed };
}

async function fetchMoexCandles(startDate?: string, endDate?: string) {
  const from = startDate || "2021-01-01";
  const till = endDate || new Date().toISOString().slice(0, 10);
  const cacheKey = `${from}|${till}`;

  const cached = moexCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < MOEX_CACHE_TTL_MS) {
    return cached.data;
  }

  const inFlight = moexInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const job = (async () => {
    const baseUrl = "https://iss.moex.com/iss/engines/stock/markets/shares/securities/SBER/candles.json";
    const parsed: { date: string; close: number }[] = [];

    let nextStart = 0;
    let reachedEnd = false;
    let lastPageLastDate: string | null = null;

    while (!reachedEnd && nextStart <= MOEX_MAX_START) {
      const batchStarts: number[] = [];
      for (let i = 0; i < MOEX_FETCH_CONCURRENCY && nextStart <= MOEX_MAX_START; i += 1) {
        batchStarts.push(nextStart);
        nextStart += MOEX_PAGE_STEP;
      }

      if (batchStarts.length === 0) {
        break;
      }

      const batchResults = await Promise.all(
        batchStarts.map(async (start) => {
          const page = await fetchMoexPage(baseUrl, from, till, start);
          return { start, ...page };
        })
      );

      batchResults.sort((a, b) => a.start - b.start);

      for (const page of batchResults) {
        if (page.rows.length === 0 || page.pageParsed.length === 0) {
          reachedEnd = true;
          break;
        }

        const pageLastDate = page.pageParsed[page.pageParsed.length - 1]?.date ?? null;
        parsed.push(...page.pageParsed);

        if (!pageLastDate || pageLastDate === lastPageLastDate) {
          reachedEnd = true;
          break;
        }

        lastPageLastDate = pageLastDate;

        if (page.rows.length < MOEX_PAGE_STEP) {
          reachedEnd = true;
          break;
        }
      }
    }

    const uniqueByDate = new Map<string, number>();
    for (const item of parsed) {
      uniqueByDate.set(item.date, item.close);
    }

    const sorted = Array.from(uniqueByDate.entries())
      .map(([date, close]) => ({ date, close }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const result = {
      dates: sorted.map((item) => item.date),
      close: sorted.map((item) => item.close),
    };

    moexCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  })();

  moexInFlight.set(cacheKey, job);

  try {
    return await job;
  } finally {
    moexInFlight.delete(cacheKey);
  }
}

// ── FastAPI client ──────────────────────────────────────────────────────────
async function callFastApi(endpoint: string, payload: unknown): Promise<any> {
  const url = `${ML_SERVICE_URL}${endpoint}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ML_SERVICE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok && !data.success) {
      throw new Error(data.error || data.detail || `FastAPI error: ${response.status}`);
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function isFastApiAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${ML_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ── Python subprocess fallback (kept for rollback) ──────────────────────────
function pythonExec(payload: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), "scripts", "ml_backend.py");
    const pythonBin = process.env.PYTHON_BIN || "python";
    const child = spawn(pythonBin, ["-X", "utf8", scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        TF_CPP_MIN_LOG_LEVEL: "2",
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8",
      },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      const trimmedStdout = stdout.trim();

      if (trimmedStdout) {
        try {
          const parsed = JSON.parse(trimmedStdout) as { success?: boolean; error?: string; detail?: string };

          if (code !== 0) {
            reject(
              new Error(
                parsed.error ||
                  parsed.detail ||
                  stderr.trim() ||
                  `Python process failed: ${code}`
              )
            );
            return;
          }

          resolve(parsed);
          return;
        } catch {
          // Fall through to generic error handling below.
        }
      }

      if (code !== 0) {
        reject(new Error(stderr.trim() || trimmedStdout || `Python process failed: ${code}`));
        return;
      }

      reject(new Error("Failed to parse python response"));
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

// ── Unified ML executor: FastAPI → fallback to pythonExec ───────────────────
async function executeMl(endpoint: string, payload: unknown): Promise<any> {
  const fallbackPayload = {
    ...(payload as Record<string, unknown>),
    action: endpoint === "/analyze" ? "analyze" : "forecast",
  };

  if (USE_FASTAPI_SERVICE) {
    const available = await isFastApiAvailable();
    if (available) {
      try {
        return await callFastApi(endpoint, payload);
      } catch (error) {
        if (ALLOW_PYTHON_FALLBACK) {
          const message =
            error instanceof Error
              ? `${error.message}${error.cause ? `; cause: ${String(error.cause)}` : ""}`
              : String(error);
          console.warn(`[ML Route] FastAPI call failed (${message}), falling back to pythonExec`);
          return pythonExec(fallbackPayload);
        }

        throw error;
      }
    }

    if (ALLOW_PYTHON_FALLBACK) {
      console.warn("[ML Route] FastAPI unavailable, falling back to pythonExec");
      return pythonExec(fallbackPayload);
    }

    throw new Error("ML service is unavailable and fallback is disabled");
  }

  // FastAPI disabled — use pythonExec directly
  return pythonExec(fallbackPayload);
}

// ── POST handler ────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      action?: MlAction;
      params?: Record<string, unknown>;
    };
    const action = body.action;

    if (!action) {
      return NextResponse.json({ success: false, error: "Missing action" }, { status: 400 });
    }

    // ─── healthCheck (with TTL cache) ────────────────────────────────────
    if (action === "healthCheck") {
      if (healthCacheEntry && Date.now() - healthCacheEntry.timestamp < HEALTH_CACHE_TTL_MS) {
        return NextResponse.json({ success: true, status: "online" });
      }

      const till = new Date().toISOString().slice(0, 10);
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 7);
      const from = fromDate.toISOString().slice(0, 10);
      await fetchMoexCandles(from, till);
      healthCacheEntry = { data: true, timestamp: Date.now() };
      return NextResponse.json({ success: true, status: "online" });
    }

    // ─── getDataPreview ──────────────────────────────────────────────────
    if (action === "getDataPreview") {
      const startDate = (body.params?.start_date as string | undefined) || undefined;
      const endDate = (body.params?.end_date as string | undefined) || undefined;
      const data = await fetchMoexCandles(startDate, endDate);
      return NextResponse.json({
        success: true,
        dates: data.dates,
        close: data.close,
        avg_price: rollingAverage(data.close, 5),
      });
    }

    // ─── trainModels (stub) ──────────────────────────────────────────────
    if (action === "trainModels") {
      return NextResponse.json({ success: true, message: "Модели обучаются в runFullAnalysis" });
    }

    // ─── runFullAnalysis (CONSOLIDATED: returns everything in one call) ──
    if (action === "runFullAnalysis") {
      const params = {
        look_back: Number(body.params?.look_back || 60),
        lstm_units: [
          Number((body.params?.lstm_units as number[] | undefined)?.[0] || 50),
          Number((body.params?.lstm_units as number[] | undefined)?.[1] || 50),
        ] as [number, number],
        epochs: Number(body.params?.epochs || 30),
        batch_size: Number(body.params?.batch_size || 32),
        forecast_block: clampInt(Number(body.params?.forecast_block || 5), 1, 5),
      };

      const startDate = (body.params?.start_date as string | undefined) || undefined;
      const endDate = (body.params?.end_date as string | undefined) || undefined;
      const data = await fetchMoexCandles(startDate, endDate);

      const python = await executeMl("/analyze", {
        close: data.close,
        dates: data.dates,
        params,
        days: 30,
        include_forecast: false,
      });

      if (!python.success) {
        throw new Error(python.error || "Python analysis failed");
      }

      latestAnalysis = {
        close: data.close,
        dates: data.dates,
        params,
        predictions: python.predictions,
        stationarity: python.stationarity,
        forecast30: python.forecast ?? null,
        walk_forward: python.walk_forward,
        realism_metrics: python.realism_metrics,
      };

      // ── CONSOLIDATED RESPONSE: includes predictions, stationarity,
      //    forecast, dates, close, avg_price — eliminates 3 extra calls ──
      return NextResponse.json({
        success: true,
        data_info: python.data_info,
        comparison_table: python.comparison_table,
        best_model: python.best_model,
        walk_forward: python.walk_forward,
        realism_metrics: python.realism_metrics,
        // Consolidated fields (eliminates makePredictions/getDataPreview/analyzeStationarity calls)
        predictions: python.predictions,
        stationarity: python.stationarity,
        forecast: python.forecast ?? null,
        dates: data.dates,
        close: data.close,
        avg_price: rollingAverage(data.close, 5),
      });
    }

    // ── Actions that require prior analysis ──────────────────────────────
    if (!latestAnalysis) {
      return NextResponse.json(
        { success: false, error: "Сначала выполните полный анализ" },
        { status: 400 }
      );
    }

    // ─── makePredictions (legacy, still works) ───────────────────────────
    if (action === "makePredictions") {
      return NextResponse.json({ success: true, predictions: latestAnalysis.predictions });
    }

    // ─── analyzeStationarity (legacy, still works) ───────────────────────
    if (action === "analyzeStationarity") {
      return NextResponse.json({ success: true, stationarity: latestAnalysis.stationarity });
    }

    // ─── forecastFuture ──────────────────────────────────────────────────
    if (action === "forecastFuture") {
      const days = clampInt(Number(body.params?.days || 30), 1, 365);
      const forceRecalculate = body.params?.recalculate === true;

      if (days === 30 && !forceRecalculate && latestAnalysis.forecast30) {
        return NextResponse.json({ success: true, forecast: latestAnalysis.forecast30 });
      }

      const futureDates = buildTradingDates(latestAnalysis.dates[latestAnalysis.dates.length - 1], days);

      const python = await executeMl("/forecast", {
        close: latestAnalysis.close,
        dates: latestAnalysis.dates,
        params: latestAnalysis.params,
        days,
        future_dates: futureDates,
      });

      if (!python.success) {
        throw new Error(python.error || "Python forecast failed");
      }

      if (days === 30) {
        latestAnalysis.forecast30 = python.forecast;
      }

      return NextResponse.json({ success: true, forecast: python.forecast });
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
