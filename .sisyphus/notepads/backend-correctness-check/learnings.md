# Learnings

- Task 0 prereq check completed with deterministic CLI commands (`--version` + `which`) and saved to `.sisyphus/evidence/task-0-prereqs.txt`.
- Present tools in current environment: `bun` 1.3.8, `python` 3.13.7, `curl` 8.15.0.

- Task 1 inventory completed as static audit evidence: backend surface notes in `.sisyphus/evidence/backend-surface.md` and path existence proof in `.sisyphus/evidence/task-1-inventory.txt`.

- Task 2 runbook captured operator startup order as `FastAPI (:8000) -> Next.js (:3000) -> Caddy (:81)` and tied each step to real repo files (`package.json`, `Caddyfile`, `scripts/ml_service.py`, `src/app/api/ml/route.ts`).
- Task 2 clarified two runtime modes from `src/app/api/ml/route.ts`: dev fallback (`ALLOW_PYTHON_FALLBACK=true`) and prod no-fallback (`ALLOW_PYTHON_FALLBACK=false`).

- Task 3 env matrix completed at `.sisyphus/evidence/backend-env-matrix.md` with grep-backed variable proof in `.sisyphus/evidence/task-3-env-grep.txt`.
- Env semantics are default-open for fallback (`USE_FASTAPI_SERVICE=true`, `ALLOW_PYTHON_FALLBACK=true` unless set to `"false"`), so prod no-fallback behavior must be explicitly configured.

- Task 4 static Caddy audit (`.sisyphus/evidence/task-4-caddy-audit.txt`) confirms listener `:81`, default proxy target `localhost:3000`, and query-param override routing via `XTransformPort` -> `localhost:{query.XTransformPort}`.

- Task 5 static standalone audit completed: `next.config.ts` uses `output:"standalone"`, and both standalone scripts resolve server path via `.next/standalone` with `required-server-files.json` fallback (`relativeAppDir`).
- Task 5 confirms postbuild asset copy contract for standalone runtime: `.next/static` -> `<standaloneAppDir>/.next/static` and `public` -> `<standaloneAppDir>/public`.

- Task 6 TypeScript signal check completed via standalone compiler command `bunx tsc --noEmit`; evidence saved in `.sisyphus/evidence/task-6-typecheck.txt` with explicit FAIL result and exit status.
- Task 6 is intentionally a signal-only step (because `next.config.ts` sets `typescript.ignoreBuildErrors=true`), so no source-code fixes were applied in this checklist item.

- Task 7 attempted FastAPI startup via PTY using `python scripts/ml_service.py`; PTY logs are suitable for evidence capture and include uvicorn readiness/error lines.
- Health probe `curl -i http://127.0.0.1:8000/health` returned `HTTP/1.1 200 OK` with `{"status":"ok"}` even when the newly spawned PTY process failed to bind.

- Task 7 PASS achieved after clearing a stale `scripts/ml_service.py` listener on port 8000 (PID 50816) and running a controlled PTY instance (`pty_b6e1df83`, PID 5032).
- Controlled verification pattern is reliable: capture uvicorn ready line, run `curl -i /health`, then confirm same PTY logs the `GET /health` 200 before graceful Ctrl+C shutdown.

- Task 8 PASS completed with controlled Next.js PTY startup using required env flags (`USE_FASTAPI_SERVICE=true`, `ALLOW_PYTHON_FALLBACK=true`, `ML_SERVICE_URL=http://127.0.0.1:8000`) and readiness proof (`Ready in 858ms`).
- `curl -i http://127.0.0.1:3000/api` returned `HTTP/1.1 200 OK` with JSON body `{"message":"Привет, мир!"}`, and PTY log confirmed `GET /api 200`.
- Clean shutdown pattern for Next PTY is stable for evidence runs: send Ctrl+C via `pty_write`, then remove session with `pty_kill cleanup=true`.

- Task 9 evidence pattern is robust when binary is missing: capture PTY startup failure text, validate absence with both `where.exe caddy` and `which caddy`, then record failed proxy curl in `.sisyphus/evidence/task-9-caddy-up.txt`.
- Task 9 cleanup note standard: confirm session exit code, remove PTY session metadata, and prove no remaining process via PowerShell (`NO_CADDY_PROCESS`).

- Task 10 smoke check evidence captured per endpoint in dedicated files with normalized header format (`RESULT`, `command`, `output`) for direct and Caddy paths.

- Task 10 controlled rerun (Next PTY with Task 8 env flags) confirmed direct endpoint recovery: `curl -i http://127.0.0.1:3000/api` returned `HTTP/1.1 200 OK` with `{"message":"Привет, мир!"}`.

- Task 11 healthCheck direct endpoint passed (`HTTP 200`, `{"success":true,"status":"online"}`) with evidence saved to `.sisyphus/evidence/task-11-ml-health-direct.txt`.
- Task 12: direct POST /api/ml checks on :3000 confirmed getDataPreview succeeds and invalid actions consistently return HTTP 400 with success:false + error.

- [2026-02-17 12:56:57] Task 13: Executed single direct POST to /api/ml runFullAnalysis on :3000 and saved raw response to .sisyphus/evidence/task-13-ml-analysis.json; response included success:true with predictions, stationarity, best_model.

- Task 14 completed with direct forecast evidence for both `days=30` and `days=31` in `.sisyphus/evidence/task-14-forecast-30.json` and `.sisyphus/evidence/task-14-forecast-31.json`; both responses include `success:true` and `forecast` object.
- Task 15 concurrency observation completed in `.sisyphus/evidence/task-15-concurrency.txt`; both parallel `runFullAnalysis` calls returned success and full payload key set.
- Task 16 fallback behavior confirmed in `.sisyphus/evidence/task-16-fallback-success.txt`: FastAPI `/health` was unreachable, but analysis request still returned `success:true` with HTTP 200 under fallback-enabled runtime.
- Task 17 prod-like behavior confirmed in `.sisyphus/evidence/task-17-prod-requires-fastapi.txt`: with fallback disabled and FastAPI down, API returns HTTP 500 and `success:false` with explicit unavailability error.
- Task 18 build/layout verification captured in `.sisyphus/evidence/task-18-standalone-layout.txt`; build succeeded and standalone tree is present (with nested path layout under `.next/standalone`).
- Task 19 standalone smoke captured in `.sisyphus/evidence/task-19-standalone-smoke.txt`; direct standalone checks passed while Caddy path remained blocked due missing binary.
- Task 20 final report generated at `.sisyphus/evidence/backend-correctness-report.md` with artifact existence proof in `.sisyphus/evidence/task-20-report-check.txt`.
- Final QA rerun artifacts were produced under `.sisyphus/evidence/final-qa/` for critical scenarios (10/11/13/16/17).
- Final checklist Caddy requirement is now satisfied using local portable binary `.local-tools/caddy.exe`; evidence in `.sisyphus/evidence/final-caddy-81-check.txt` shows HTTP 200 for both `GET /api` and `POST /api/ml` health check via `:81`.
- Final checklist standalone-assets requirement is satisfied; `.sisyphus/evidence/final-standalone-assets-check.txt` confirms presence of both `.next/static` and `public` inside `.next/standalone` tree.
