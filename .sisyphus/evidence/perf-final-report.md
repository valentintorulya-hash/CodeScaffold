# Performance Final Report

Date: 2026-02-15

## Scope

Final regression for the optimization plan:
- API latency before/after
- Response contract checks
- Accuracy regression tolerance check (<= 1%)
- Fallback behavior when FastAPI is unavailable
- UI smoke verification

## Before vs After (API)

`runFullAnalysis` payload used in both runs:
`{"start_date":"2023-01-01","end_date":"2024-01-01","look_back":60,"lstm_units":[50,50],"epochs":30,"batch_size":32}`

| Metric | Baseline | Final | Delta | Delta % |
|---|---:|---:|---:|---:|
| avg (ms) | 150,435 | 145,547 | -4,888 | -3.25% |
| p50 (ms) | 148,790 | 145,646 | -3,144 | -2.11% |
| p95 (ms) | 155,298 | 146,162 | -9,136 | -5.88% |

Source files:
- Baseline: `.sisyphus/evidence/perf-baseline.json`
- Final: `.sisyphus/evidence/perf-final.json`

## Fast-path checks

- `forecastFuture(30)` baseline: `7ms`, final: `10ms` (still near-instant cache path)
- Invalid action contract baseline: `400`, final: `400`
- Final invalid error body: `{"success":false,"error":"Unknown action"}`

Evidence:
- `.sisyphus/evidence/baseline-forecast30.json`
- `.sisyphus/evidence/final-forecast30.json`
- `.sisyphus/evidence/final-invalid-action.json`

## Consolidated Response Contract

Validated through integrated Next API route test (`/api/ml` -> FastAPI path):
- `data_info`: present
- `comparison_table`: present
- `best_model`: present
- `predictions`: present
- `stationarity`: present
- `forecast`: present
- `dates`: present
- `close`: present
- `avg_price`: present

Evidence:
- `.sisyphus/evidence/test-integration.mjs`
- PTY output `pty_1a4575f4` (all checks passed)

## Accuracy Regression Check (<= 1%)

Compared `comparison_table` values from baseline vs final:
- ARIMA: MAE/RMSE/MAPE/R2 delta = `0.0000%`
- LSTM: MAE/RMSE/MAPE/R2 delta = `0.0000%`
- Hybrid: MAE/RMSE/MAPE/R2 delta = `0.0000%`

Forecast array equivalence (`hybrid`, `arima`, confidence bounds, dates): exact match (`max_abs_diff = 0`).

Evidence:
- `.sisyphus/evidence/baseline-runfullanalysis.json`
- `.sisyphus/evidence/final-runfullanalysis.json`
- `.sisyphus/evidence/baseline-forecast30.json`
- `.sisyphus/evidence/final-forecast30.json`

Result: PASS (no measurable accuracy degradation; within 1% tolerance).

## Fallback Verification (FastAPI Down)

Scenario:
- FastAPI service stopped
- `runFullAnalysis` called through Next API
- Route falls back to `pythonExec`

Observed result:
- HTTP `200`
- `success: true`
- Full consolidated payload still present (`data_info`, `predictions`, `stationarity`, `forecast`)
- Elapsed: `163,682ms`

Evidence:
- `.sisyphus/evidence/test-fallback.mjs`
- `.sisyphus/evidence/fallback-result.json`
- Dev log entries show fallback messages in `pty_a85d7bcd`

## UI Smoke

Playwright MCP smoke check:
- Dashboard loads
- Tabs switch correctly (`aria-selected=true`): forecasts, comparison, analysis, future
- Future tab renders forecast chart and table

Evidence:
- `.sisyphus/evidence/task-10-ui-smoke.txt`
- `.sisyphus/evidence/task-10-e2e.png`

## Final Verdict

PASS.

Goals satisfied:
- API is faster on the main critical path (`runFullAnalysis` p95 improved by 5.88%)
- Functional behavior preserved (same metrics and forecast outputs)
- Consolidated response contract works (single-call frontend consumption)
- Fallback path is resilient when FastAPI is unavailable
