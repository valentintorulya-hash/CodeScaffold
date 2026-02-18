# Backend Correctness Report

Date: 2026-02-17

## Scope

Verification-only pass for backend runtime behavior in this repository (Next.js App Router API + ML route + FastAPI integration + standalone build/runtime + Caddy proxy path checks).

## Verified Behaviors

- Base API route works directly on Next runtime (`/api`): see `.sisyphus/evidence/task-10-api-direct.txt`.
- ML health action works directly (`POST /api/ml` with `healthCheck`): `.sisyphus/evidence/task-11-ml-health-direct.txt`.
- Preview + negative paths validated (`getDataPreview`, missing action, unknown action, forecast-before-analysis):
  - `.sisyphus/evidence/task-12-ml-preview.json`
  - `.sisyphus/evidence/task-12-missing-action.txt`
  - `.sisyphus/evidence/task-12-unknown-action.txt`
  - `.sisyphus/evidence/task-12-forecast-without-analysis.txt`
- Full analysis success payload validated (`runFullAnalysis`): `.sisyphus/evidence/task-13-ml-analysis.json`.
- Forecast success validated for 30 and 31 days:
  - `.sisyphus/evidence/task-14-forecast-30.json`
  - `.sisyphus/evidence/task-14-forecast-31.json`
- Concurrency observation captured for two parallel analysis requests:
  - `.sisyphus/evidence/task-15-concurrency.txt`
- Dev fallback behavior confirmed (FastAPI down + fallback enabled => success):
  - `.sisyphus/evidence/task-16-fallback-success.txt`
- Prod-like no-fallback behavior confirmed (FastAPI down + fallback disabled => clear failure):
  - `.sisyphus/evidence/task-17-prod-requires-fastapi.txt`

## Build/Standalone Verification

- Production build succeeds and standalone artifacts are generated: `.sisyphus/evidence/task-18-standalone-layout.txt`.
- Standalone `bun start` smoke (direct path) works for `/api`: `.sisyphus/evidence/task-19-standalone-smoke.txt`.
- Standalone copied assets are present in standalone tree (`.next/static` and `public`): `.sisyphus/evidence/final-standalone-assets-check.txt`.

## Caddy Status

- Historical attempts failed when `caddy` was not available in PATH (documented in early evidence).
- Final verification used a local portable Caddy binary (`.local-tools/caddy.exe`) and validated proxy path on `:81`.
- Confirmed through Caddy:
  - `GET /api` -> HTTP 200
  - `POST /api/ml` (`healthCheck`) -> HTTP 200 with `{"success":true,"status":"online"}`
- Evidence:
  - `.sisyphus/evidence/final-caddy-81-check.txt`
  - `.sisyphus/evidence/task-9-caddy-up.txt`
  - `.sisyphus/evidence/task-10-api-caddy.txt`
  - `.sisyphus/evidence/task-11-ml-health-caddy.txt`

## Exact Repro Commands

```bash
bun run build
curl -i http://127.0.0.1:3000/api
curl -i -X POST http://127.0.0.1:3000/api/ml -H "content-type: application/json" -d '{"action":"healthCheck"}'
curl -i -X POST http://127.0.0.1:3000/api/ml -H "content-type: application/json" -d '{"action":"runFullAnalysis","params":{}}'
curl -i -X POST http://127.0.0.1:3000/api/ml -H "content-type: application/json" -d '{"action":"forecastFuture","params":{"days":30}}'
curl -i -X POST http://127.0.0.1:3000/api/ml -H "content-type: application/json" -d '{"action":"forecastFuture","params":{"days":31}}'
./.local-tools/caddy.exe run --config Caddyfile
curl -i http://127.0.0.1:81/api
curl -i -X POST http://127.0.0.1:81/api/ml -H "content-type: application/json" -d '{"action":"healthCheck"}'
```

## Findings (Non-blocking Risks)

- API routes are unauthenticated and have no visible rate limiting controls.
- System behavior depends on runtime environment flags (`USE_FASTAPI_SERVICE`, `ALLOW_PYTHON_FALLBACK`, `ML_SERVICE_URL`).
- Several flows rely on in-memory process state; behavior can reset across restarts.
- Build is configured to ignore TypeScript errors; `bun run build` pass is not a strict type-safety guarantee.
