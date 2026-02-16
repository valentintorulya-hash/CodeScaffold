import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE_URL = "http://localhost:3000/api/ml";
const EVIDENCE_DIR = join(process.cwd(), ".sisyphus", "evidence");

const ANALYSIS_PAYLOAD = {
  action: "runFullAnalysis",
  params: {
    start_date: "2023-01-01",
    end_date: "2024-01-01",
    look_back: 60,
    lstm_units: [50, 50],
    epochs: 30,
    batch_size: 32,
  },
};

const FORECAST_PAYLOAD = { action: "forecastFuture", params: { days: 30 } };
const INVALID_PAYLOAD = { action: "unknownAction", params: {} };

function percentile(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function timedFetch(payload, label) {
  const start = performance.now();
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const elapsed = Math.round(performance.now() - start);
  const data = await res.json();
  console.log(`${label}: ${elapsed}ms, status=${res.status}, success=${Boolean(data?.success)}`);
  return { elapsed, status: res.status, data };
}

function readBaselineAvgMs() {
  try {
    const raw = readFileSync(join(EVIDENCE_DIR, "perf-baseline.json"), "utf-8");
    const baseline = JSON.parse(raw);
    return baseline?.runFullAnalysis?.avg_ms ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const runs = [];
  let firstResponse = null;

  for (let i = 0; i < 3; i += 1) {
    const result = await timedFetch(ANALYSIS_PAYLOAD, `runFullAnalysis #${i + 1}/3`);
    if (result.status === 200 && result.data?.success) {
      runs.push(result.elapsed);
      if (!firstResponse) {
        firstResponse = result.data;
        writeFileSync(join(EVIDENCE_DIR, "final-runfullanalysis.json"), JSON.stringify(result.data, null, 2));
      }
    }
  }

  if (runs.length === 0) {
    throw new Error("All runFullAnalysis attempts failed");
  }

  const sorted = [...runs].sort((a, b) => a - b);
  const avg = Math.round(runs.reduce((a, b) => a + b, 0) / runs.length);
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);

  const forecast = await timedFetch(FORECAST_PAYLOAD, "forecastFuture(30)");
  const invalid = await timedFetch(INVALID_PAYLOAD, "invalidAction");

  const baselineAvg = readBaselineAvgMs();
  const deltaMs = baselineAvg == null ? null : avg - baselineAvg;
  const deltaPct = baselineAvg == null ? null : Number((((avg - baselineAvg) / baselineAvg) * 100).toFixed(2));

  const consolidatedChecks = {
    predictions: Boolean(firstResponse?.predictions),
    stationarity: Boolean(firstResponse?.stationarity),
    forecast: Boolean(firstResponse?.forecast),
    dates: Array.isArray(firstResponse?.dates),
    close: Array.isArray(firstResponse?.close),
    avg_price: Array.isArray(firstResponse?.avg_price),
  };

  const report = {
    timestamp: new Date().toISOString(),
    base_url: BASE_URL,
    scenario: "final regression",
    payload: ANALYSIS_PAYLOAD.params,
    runFullAnalysis: {
      runs,
      avg_ms: avg,
      p50_ms: p50,
      p95_ms: p95,
      min_ms: sorted[0],
      max_ms: sorted[sorted.length - 1],
      successful_runs: runs.length,
    },
    forecastFuture30: {
      duration_ms: forecast.elapsed,
      status: forecast.status,
      success: Boolean(forecast.data?.success),
    },
    invalidAction: {
      duration_ms: invalid.elapsed,
      status: invalid.status,
      success: Boolean(invalid.data?.success),
      error: invalid.data?.error,
    },
    consolidated_response_checks: consolidatedChecks,
    baseline_comparison: {
      baseline_avg_ms: baselineAvg,
      delta_ms: deltaMs,
      delta_pct: deltaPct,
      interpretation:
        deltaPct == null
          ? "baseline missing"
          : deltaPct < 0
            ? `improved by ${Math.abs(deltaPct)}%`
            : `regressed by ${deltaPct}%`,
    },
  };

  writeFileSync(join(EVIDENCE_DIR, "perf-final.json"), JSON.stringify(report, null, 2));
  writeFileSync(join(EVIDENCE_DIR, "final-forecast30.json"), JSON.stringify(forecast.data, null, 2));
  writeFileSync(
    join(EVIDENCE_DIR, "final-invalid-action.json"),
    JSON.stringify({ status: invalid.status, body: invalid.data }, null, 2)
  );

  console.log("\nSaved:");
  console.log("- .sisyphus/evidence/perf-final.json");
  console.log("- .sisyphus/evidence/final-runfullanalysis.json");
  console.log("- .sisyphus/evidence/final-forecast30.json");
  console.log("- .sisyphus/evidence/final-invalid-action.json");
  console.log("\nSummary:");
  console.log(`runFullAnalysis avg=${avg}ms p50=${p50}ms p95=${p95}ms`);
  if (baselineAvg != null) {
    console.log(`baseline avg=${baselineAvg}ms -> ${report.baseline_comparison.interpretation}`);
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
