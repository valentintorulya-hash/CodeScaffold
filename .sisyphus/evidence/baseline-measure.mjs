// Baseline measurement script for performance optimization project
// Runs timed API calls and saves evidence files

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'http://localhost:3000/api/ml';
const EVIDENCE_DIR = join(import.meta.dirname);

const ANALYSIS_PAYLOAD = {
  action: 'runFullAnalysis',
  params: {
    start_date: '2023-01-01',
    end_date: '2024-01-01',
    look_back: 60,
    lstm_units: [50, 50],
    epochs: 30,
    batch_size: 32,
  },
};

const FORECAST_PAYLOAD = {
  action: 'forecastFuture',
  params: { days: 30 },
};

const INVALID_PAYLOAD = {
  action: 'unknownAction',
};

async function timedFetch(payload, label) {
  console.log(`[${new Date().toISOString()}] Starting: ${label}...`);
  const start = performance.now();
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const elapsed = performance.now() - start;
  const data = await res.json();
  console.log(`[${new Date().toISOString()}] Done: ${label} — ${Math.round(elapsed)}ms, status=${res.status}, success=${data.success}`);
  return { elapsed, status: res.status, data };
}

function percentile(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function main() {
  const NUM_RUNS = 3;
  const analysisTimings = [];
  let firstAnalysisResponse = null;

  // 1. Run runFullAnalysis NUM_RUNS times
  for (let i = 0; i < NUM_RUNS; i++) {
    const { elapsed, data } = await timedFetch(ANALYSIS_PAYLOAD, `runFullAnalysis #${i + 1}/${NUM_RUNS}`);
    analysisTimings.push(Math.round(elapsed));
    if (i === 0) {
      firstAnalysisResponse = data;
      writeFileSync(
        join(EVIDENCE_DIR, 'baseline-runfullanalysis.json'),
        JSON.stringify(data, null, 2)
      );
      console.log('  -> Saved baseline-runfullanalysis.json');
    }
  }

  // 2. Run forecastFuture(30)
  const forecast30 = await timedFetch(FORECAST_PAYLOAD, 'forecastFuture(30)');
  writeFileSync(
    join(EVIDENCE_DIR, 'baseline-forecast30.json'),
    JSON.stringify(forecast30.data, null, 2)
  );
  console.log('  -> Saved baseline-forecast30.json');

  // 3. Run invalid action
  const invalidAction = await timedFetch(INVALID_PAYLOAD, 'invalidAction');
  writeFileSync(
    join(EVIDENCE_DIR, 'baseline-invalid-action.json'),
    JSON.stringify({ status: invalidAction.status, body: invalidAction.data }, null, 2)
  );
  console.log('  -> Saved baseline-invalid-action.json');

  // 4. Compute stats
  const sorted = [...analysisTimings].sort((a, b) => a - b);
  const avg = Math.round(analysisTimings.reduce((a, b) => a + b, 0) / analysisTimings.length);
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);

  const report = {
    timestamp: new Date().toISOString(),
    scenario: 'runFullAnalysis',
    payload: ANALYSIS_PAYLOAD.params,
    runs: NUM_RUNS,
    timings_ms: analysisTimings,
    stats: {
      avg_ms: avg,
      p50_ms: p50,
      p95_ms: p95,
      min_ms: sorted[0],
      max_ms: sorted[sorted.length - 1],
    },
    forecast30: {
      timing_ms: Math.round(forecast30.elapsed),
      success: forecast30.data?.success ?? false,
    },
    invalidAction: {
      timing_ms: Math.round(invalidAction.elapsed),
      status: invalidAction.status,
      has_error: !!invalidAction.data?.error,
    },
    analysis_response_keys: firstAnalysisResponse ? Object.keys(firstAnalysisResponse) : [],
  };

  writeFileSync(
    join(EVIDENCE_DIR, 'perf-baseline.json'),
    JSON.stringify(report, null, 2)
  );
  console.log('\n=== BASELINE REPORT ===');
  console.log(JSON.stringify(report.stats, null, 2));
  console.log(`forecast30: ${report.forecast30.timing_ms}ms (success=${report.forecast30.success})`);
  console.log(`invalidAction: ${report.invalidAction.timing_ms}ms (status=${report.invalidAction.status})`);
  console.log('\n  -> Saved perf-baseline.json');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
