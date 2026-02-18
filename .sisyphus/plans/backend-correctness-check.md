# Backend Correctness Check (Full Stack)

## TL;DR

> **Quick Summary**: Verify that the backend works end-to-end as a 3-process stack (Caddy -> Next.js -> FastAPI ML), with dev-only Python subprocess fallback and production requiring FastAPI.
>
> **Deliverables**:
> - Evidence-backed runtime verification for `/api` and `/api/ml` (direct port and through Caddy)
> - Backend runbook: required env vars, start order, ports
> - Correctness report with observed failures (if any) and exact reproduction steps
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 5 waves
> **Critical Path**: Start services -> API verification -> fallback verification -> standalone verification

---

## Context

### Original Request
User: "check backend correctness"

### Decisions
- Target runtime: Full stack (Caddy `:81` + Next.js `:3000` + FastAPI ML `:8000`).
- FastAPI outage behavior: Dev-only fallback
  - Dev: allow Python subprocess fallback when FastAPI is down.
  - Prod: treat FastAPI as required (disable fallback and fail clearly).

### Backend Surface (known entrypoints)
- Next.js API routes:
  - `src/app/api/route.ts` (GET)
  - `src/app/api/ml/route.ts` (POST, multi-action)
- ML services:
  - `scripts/ml_service.py` (FastAPI: `/health`, `/analyze`, `/forecast`)
  - `scripts/ml_backend.py` (Python fallback)
- Reverse proxy: `Caddyfile` (listen `:81` -> `localhost:3000`)
- Standalone start/build:
  - `scripts/postbuild-copy.mjs`
  - `scripts/start-standalone.mjs`
- Orchestration (bash): `.zscripts/*` (requires WSL/Git Bash on Windows)

---

## Work Objectives

### Core Objective
Prove (with agent-executed evidence) that the backend stack starts reliably and the key API flows work under both dev fallback and prod-required FastAPI modes.

### Concrete Deliverables
- Evidence files under `.sisyphus/evidence/`
- Report: `.sisyphus/evidence/backend-correctness-report.md`
- Runbook: `.sisyphus/evidence/backend-runbook.md`

### Must Have
- Full stack can be started locally in a documented order.
- `/api` responds via `:3000` and via Caddy `:81`.
- `/api/ml` verified for: `healthCheck`, `getDataPreview`, `runFullAnalysis`, `forecastFuture`.
- Dev fallback proven (FastAPI down + fallback enabled -> success).
- Prod behavior proven (FastAPI down + fallback disabled -> clear failure).

### Must NOT Have (guardrails)
- No ML algorithm changes; verify orchestration only.
- No auth/rate-limit implementation (record findings only).
- No Prisma schema changes.

---

## Verification Strategy

### Test Decision
- Test framework: none (agent-executed QA only).

### Evidence Policy
- Use PTY sessions for long-running processes (FastAPI, Next.js, Caddy).
- Save curl responses and relevant log excerpts.
- Evidence naming: `.sisyphus/evidence/task-{N}-{slug}.{txt|json}`.

---

## Execution Strategy

### Parallel Waves

Wave 1 (Static audit + runbook scaffolding):
- Tasks 0-6

Wave 2 (Bring up services in parallel):
- Tasks 7-9

Wave 3 (API QA):
- Tasks 10-15

Wave 4 (Fallback behavior):
- Tasks 16-17

Wave 5 (Standalone / prod-ish verification):
- Tasks 18-20

### Dependency Matrix (abbreviated)

| Task | Depends On | Blocks | Wave |
|------|------------|--------|------|
| 0-6  | -          | 7-20   | 1 |
| 7    | -          | 11-14, 19 | 2 |
| 8    | 3          | 10-17, 19 | 2 |
| 9    | 4, 8       | 10-17, 19 | 2 |
| 10-12| 8, 9       | 13-15  | 3 |
| 13   | 7-9        | 14-17  | 3 |
| 14   | 13         | -      | 3 |
| 16-17| 8, 9       | -      | 4 |
| 18   | 5          | 19     | 5 |
| 19   | 7, 9, 18   | 20     | 5 |
| 20   | 7-19       | Final  | 5 |

### Agent Dispatch Summary

| Wave | Tasks | Suggested Agent Category |
|------|-------|--------------------------|
| 1 | 0-6 | `quick` (docs/audit) + `unspecified-high` (typecheck execution) |
| 2 | 7-9 | `unspecified-high` (runtime bring-up) |
| 3 | 10-14 | `quick` / `unspecified-high` |
| 3 | 15 | `deep` (interpret concurrency/state behavior) |
| 4 | 16-17 | `unspecified-high` |
| 5 | 18-19 | `unspecified-high` |
| 5 | 20 | `writing` |
| FINAL | F1-F4 | `oracle` / `unspecified-high` / `deep` |

## TODOs

> Notes:
> - This plan is primarily verification (not feature development).
> - Avoid parallelizing heavy ML actions; observe single-request behavior first.
>
> Evidence naming: `.sisyphus/evidence/task-{N}-{slug}.{txt|json|md}`

- [x] 0. Prerequisite & Tooling Check (bun, python, caddy)

  **What to do**:
  - Record versions/paths for:
    - `bun`
    - `python` (and/or `python3`)
    - `caddy`
    - `curl`
  - If a prerequisite is missing, record it explicitly and stop before runtime QA tasks.

  **Recommended Agent Profile**:
  - Category: `quick`

  **Parallelization**:
  - Can Run In Parallel: YES (Wave 1)

  **Acceptance Criteria**:
  - `.sisyphus/evidence/task-0-prereqs.txt` exists.

  **QA Scenarios**:
  - Scenario: tool versions
    Tool: Bash
    Steps:
      1. Run `bun --version`, `python --version`, `caddy version`, `curl --version`.
      2. Save output.
    Evidence: `.sisyphus/evidence/task-0-prereqs.txt`

- [x] 1. Backend Surface Inventory (API + services)

  **What to do**:
  - Enumerate backend entry points and summarize behavior for:
    - `src/app/api/route.ts`
    - `src/app/api/ml/route.ts`
    - `scripts/ml_service.py`
    - `scripts/ml_backend.py`
    - `Caddyfile`
  - Write `.sisyphus/evidence/backend-surface.md` (paths + 1-2 lines each).

  **Recommended Agent Profile**:
  - Category: `quick`

  **Parallelization**:
  - Can Run In Parallel: YES (Wave 1)

  **Acceptance Criteria**:
  - `.sisyphus/evidence/backend-surface.md` exists.

  **QA Scenarios**:
  - Scenario: Inventory completeness
    Tool: Bash
    Steps:
      1. Confirm each path exists.
      2. Save a file listing excerpt.
    Evidence: `.sisyphus/evidence/task-1-inventory.txt`

- [x] 2. Backend Runbook (start order + ports)

  **What to do**:
  - Write `.sisyphus/evidence/backend-runbook.md` with:
    - Start order: FastAPI -> Next.js -> Caddy
    - Ports: FastAPI `8000`, Next.js `3000`, Caddy `81`
    - “Dev fallback” vs “Prod no fallback” modes

  **Recommended Agent Profile**:
  - Category: `quick`

  **Parallelization**:
  - Can Run In Parallel: YES (Wave 1)

  **References**:
  - `package.json` (scripts)
  - `Caddyfile`
  - `scripts/ml_service.py`

  **Acceptance Criteria**:
  - `.sisyphus/evidence/backend-runbook.md` exists.

  **QA Scenarios**:
  - Scenario: Runbook references real files
    Tool: Bash
    Steps:
      1. Validate referenced paths exist.
    Evidence: `.sisyphus/evidence/task-2-runbook-check.txt`

- [x] 3. Env Var Matrix (dev vs prod)

  **What to do**:
  - Produce `.sisyphus/evidence/backend-env-matrix.md` listing required/optional env vars and defaults.
  - Explicitly include:
    - `DATABASE_URL`
    - `USE_FASTAPI_SERVICE`
    - `ALLOW_PYTHON_FALLBACK`
    - `ML_SERVICE_URL`
    - `ML_SERVICE_TIMEOUT_MS`
    - `PYTHON_BIN`

  **Recommended Agent Profile**:
  - Category: `quick`

  **Parallelization**:
  - Can Run In Parallel: YES (Wave 1)

  **References**:
  - `src/app/api/ml/route.ts`
  - `prisma/schema.prisma`

  **Acceptance Criteria**:
  - `.sisyphus/evidence/backend-env-matrix.md` exists.

  **QA Scenarios**:
  - Scenario: Grep env vars in code
    Tool: Bash
    Steps:
      1. Search repo for these env var names and save results.
    Evidence: `.sisyphus/evidence/task-3-env-grep.txt`

- [x] 4. Proxy/Ports Audit (Caddy)

  **What to do**:
  - Confirm that `:81` proxies to `localhost:3000` by default.
  - Document any special routing (query-param port transform).

  **Recommended Agent Profile**:
  - Category: `quick`

  **Parallelization**:
  - Can Run In Parallel: YES (Wave 1)

  **References**:
  - `Caddyfile`

  **Acceptance Criteria**:
  - `.sisyphus/evidence/task-4-caddy-audit.txt` exists.

  **QA Scenarios**:
  - Scenario: Extract key routing rules
    Tool: Bash
    Steps:
      1. Save the Caddyfile content (or relevant excerpt) into evidence.
    Evidence: `.sisyphus/evidence/task-4-caddy-audit.txt`

- [x] 5. Standalone Build/Start Audit (scripts)

  **What to do**:
  - Document how `bun run build` + `bun start` work in standalone mode.
  - Record expected `.next/standalone` layout and common pitfalls on Windows.

  **Recommended Agent Profile**:
  - Category: `quick`

  **Parallelization**:
  - Can Run In Parallel: YES (Wave 1)

  **References**:
  - `scripts/postbuild-copy.mjs`
  - `scripts/start-standalone.mjs`
  - `next.config.ts` (standalone output)

  **Acceptance Criteria**:
  - `.sisyphus/evidence/task-5-standalone-audit.txt` exists.

  **QA Scenarios**:
  - Scenario: Confirm scripts reference `.next/standalone`
    Tool: Bash
    Steps:
      1. Grep scripts for `.next/standalone` and required-server-files.json.
    Evidence: `.sisyphus/evidence/task-5-standalone-grep.txt`

- [x] 6. TypeScript Signal Check (Next build ignores TS errors)

  **What to do**:
  - Run a TS typecheck outside Next build (e.g. `bunx tsc --noEmit`).
  - Record PASS/FAIL + output; do not refactor.

  **Recommended Agent Profile**:
  - Category: `unspecified-high`

  **Parallelization**:
  - Can Run In Parallel: YES (Wave 1)

  **References**:
  - `next.config.ts`

  **Acceptance Criteria**:
  - `.sisyphus/evidence/task-6-typecheck.txt` exists.

  **QA Scenarios**:
  - Scenario: Typecheck
    Tool: Bash
    Steps:
      1. Run typecheck.
      2. Save output.
    Evidence: `.sisyphus/evidence/task-6-typecheck.txt`

- [x] 7. Start FastAPI ML Service (PTY)

  **What to do**:
  - Start `python scripts/ml_service.py`.
  - Verify `GET /health` returns 200.

  **Recommended Agent Profile**:
  - Category: `unspecified-high`

  **Parallelization**:
  - Can Run In Parallel: YES (Wave 2)

  **Acceptance Criteria**:
  - `curl http://127.0.0.1:8000/health` returns 200 and JSON status.

  **QA Scenarios**:
  - Scenario: FastAPI health
    Tool: PTY + Bash
    Steps:
      1. Start FastAPI in PTY.
      2. Curl `/health`.
    Evidence: `.sisyphus/evidence/task-7-fastapi-health.txt`

- [x] 8. Start Next.js Dev Server (PTY) with dev fallback enabled

  **What to do**:
  - Start `bun run dev` with:
    - `USE_FASTAPI_SERVICE=true`
    - `ALLOW_PYTHON_FALLBACK=true`
    - `ML_SERVICE_URL=http://127.0.0.1:8000`
  - Verify `GET /api` returns JSON.

  **Recommended Agent Profile**:
  - Category: `unspecified-high`

  **Parallelization**:
  - Can Run In Parallel: YES (Wave 2)

  **Acceptance Criteria**:
  - `curl http://127.0.0.1:3000/api` returns 200 JSON.

  **QA Scenarios**:
  - Scenario: Next.js up
    Tool: PTY + Bash
    Steps:
      1. Start Next.js in PTY.
      2. Curl `/api`.
    Evidence: `.sisyphus/evidence/task-8-next-dev.txt`

- [x] 9. Start Caddy (PTY) and verify proxy

  **What to do**:
  - Start `caddy run --config Caddyfile`.
  - Verify proxy works: `curl http://127.0.0.1:81/api`.

  **Recommended Agent Profile**:
  - Category: `unspecified-high`

  **Parallelization**:
  - Can Run In Parallel: YES (Wave 2)

  **Acceptance Criteria**:
  - `curl http://127.0.0.1:81/api` returns 200 JSON.

  **QA Scenarios**:
  - Scenario: Caddy up
    Tool: PTY + Bash
    Steps:
      1. Start Caddy in PTY.
      2. Curl `/api`.
    Evidence: `.sisyphus/evidence/task-9-caddy-up.txt`

## API QA (Wave 3)

- [x] 10. Smoke Test `/api` (direct + via Caddy)

  **What to do**:
  - Curl both endpoints and record JSON responses.

  **Recommended Agent Profile**:
  - Category: `quick`

  **Parallelization**:
  - Can Run In Parallel: YES (Wave 3)
  - Blocked By: 8, 9

  **Acceptance Criteria**:
  - Both endpoints return HTTP 200 and a JSON object containing a `message` field.

  **QA Scenarios**:
  - Scenario: `/api` direct
    Tool: Bash
    Steps:
      1. `curl -i http://127.0.0.1:3000/api`
    Evidence: `.sisyphus/evidence/task-10-api-direct.txt`
  - Scenario: `/api` via Caddy
    Tool: Bash
    Steps:
      1. `curl -i http://127.0.0.1:81/api`
    Evidence: `.sisyphus/evidence/task-10-api-caddy.txt`

- [x] 11. `/api/ml` healthCheck (direct + via Caddy)

  **What to do**:
  - POST `{ "action": "healthCheck" }` and record responses.

  **Recommended Agent Profile**:
  - Category: `quick`

  **Parallelization**:
  - Can Run In Parallel: YES (Wave 3)
  - Blocked By: 7, 8, 9

  **Acceptance Criteria**:
  - Response contains `success:true`.

  **QA Scenarios**:
  - Scenario: healthCheck direct
    Tool: Bash
    Steps:
      1. `curl -i -X POST http://127.0.0.1:3000/api/ml -H "content-type: application/json" -d '{"action":"healthCheck"}'`
    Evidence: `.sisyphus/evidence/task-11-ml-health-direct.txt`
  - Scenario: healthCheck via Caddy
    Tool: Bash
    Steps:
      1. `curl -i -X POST http://127.0.0.1:81/api/ml -H "content-type: application/json" -d '{"action":"healthCheck"}'`
    Evidence: `.sisyphus/evidence/task-11-ml-health-caddy.txt`

- [x] 12. `/api/ml` getDataPreview

  **What to do**:
  - Call `getDataPreview` and verify non-empty arrays.

  **Recommended Agent Profile**:
  - Category: `unspecified-high`

  **Parallelization**:
  - Can Run In Parallel: YES (Wave 3)
  - Blocked By: 8

  **Acceptance Criteria**:
  - JSON contains `success:true` and arrays `dates` and `close` of equal length > 0.

  **QA Scenarios**:
  - Scenario: getDataPreview via Caddy
    Tool: Bash
    Steps:
      1. `curl -sS -X POST http://127.0.0.1:81/api/ml -H "content-type: application/json" -d '{"action":"getDataPreview","params":{}}'`
      2. Save output.
    Evidence: `.sisyphus/evidence/task-12-ml-preview.json`

  - Scenario: missing action rejected
    Tool: Bash
    Steps:
      1. `curl -i -X POST http://127.0.0.1:81/api/ml -H "content-type: application/json" -d '{}'`
      2. Record status code and body.
    Expected Result: HTTP 400 with JSON containing `success:false` and non-empty `error`.
    Evidence: `.sisyphus/evidence/task-12-missing-action.txt`

  - Scenario: unknown action rejected
    Tool: Bash
    Steps:
      1. `curl -i -X POST http://127.0.0.1:81/api/ml -H "content-type: application/json" -d '{"action":"notARealAction"}'`
      2. Record status code and body.
    Expected Result: HTTP 400 with JSON containing `success:false` and non-empty `error`.
    Evidence: `.sisyphus/evidence/task-12-unknown-action.txt`

  - Scenario: forecast before analysis rejected
    Tool: Bash
    Steps:
      1. `curl -i -X POST http://127.0.0.1:81/api/ml -H "content-type: application/json" -d '{"action":"forecastFuture","params":{"days":30}}'`
      2. Record status code and body.
    Expected Result: HTTP 400 with JSON containing `success:false` and non-empty `error`.
    Evidence: `.sisyphus/evidence/task-12-forecast-without-analysis.txt`

- [x] 13. `/api/ml` runFullAnalysis (single request)

  **What to do**:
  - Trigger analysis and validate top-level keys.

  **Recommended Agent Profile**:
  - Category: `unspecified-high`

  **Parallelization**:
  - Can Run In Parallel: NO (heavy; avoid parallel ML runs)

  **Acceptance Criteria**:
  - JSON contains `success:true` and key presence: `predictions`, `stationarity`, `best_model`.

  **QA Scenarios**:
  - Scenario: runFullAnalysis via Caddy
    Tool: Bash
    Steps:
      1. `curl -sS -X POST http://127.0.0.1:81/api/ml -H "content-type: application/json" -d '{"action":"runFullAnalysis","params":{}}'`
      2. Save output.
    Evidence: `.sisyphus/evidence/task-13-ml-analysis.json`

- [x] 14. `/api/ml` forecastFuture (30 vs non-30)

  **What to do**:
  - After Task 13, call `forecastFuture` with `days=30` and `days=31`.

  **Recommended Agent Profile**:
  - Category: `unspecified-high`

  **Parallelization**:
  - Can Run In Parallel: NO
  - Blocked By: 13

  **Acceptance Criteria**:
  - Both responses contain `success:true` and a `forecast` field (record observed shape).

  **QA Scenarios**:
  - Scenario: forecast 30
    Tool: Bash
    Steps:
      1. `curl -sS -X POST http://127.0.0.1:81/api/ml -H "content-type: application/json" -d '{"action":"forecastFuture","params":{"days":30}}'`
    Evidence: `.sisyphus/evidence/task-14-forecast-30.json`
  - Scenario: forecast 31
    Tool: Bash
    Steps:
      1. `curl -sS -X POST http://127.0.0.1:81/api/ml -H "content-type: application/json" -d '{"action":"forecastFuture","params":{"days":31}}'`
    Evidence: `.sisyphus/evidence/task-14-forecast-31.json`

- [x] 15. Concurrency Sanity Observation (optional, observe-only)

  **What to do**:
  - Fire two `runFullAnalysis` requests concurrently and observe:
    - errors/timeouts
    - cross-request state leakage
    - overall latency

  **Recommended Agent Profile**:
  - Category: `deep`

  **Parallelization**:
  - Can Run In Parallel: NO

  **Acceptance Criteria**:
  - Evidence contains both responses and timestamps, plus 3-5 bullet interpretation.

  **QA Scenarios**:
  - Scenario: parallel analysis requests
    Tool: Bash
    Steps:
      1. Run two POSTs in parallel.
      2. Capture outputs and times.
    Evidence: `.sisyphus/evidence/task-15-concurrency.txt`

## Fallback QA (Wave 4)

- [x] 16. Dev Fallback Works (FastAPI down, fallback enabled)

  **What to do**:
  - Stop FastAPI.
  - Ensure Next.js runs with `ALLOW_PYTHON_FALLBACK=true`.
  - Re-run `runFullAnalysis` and confirm it succeeds (via python subprocess).

  **Recommended Agent Profile**:
  - Category: `unspecified-high`

  **Parallelization**:
  - Can Run In Parallel: NO

  **Acceptance Criteria**:
  - Request returns `success:true` even though FastAPI `/health` is down.

  **QA Scenarios**:
  - Scenario: analysis succeeds without FastAPI
    Tool: PTY + Bash
    Steps:
      1. Stop FastAPI PTY session.
      2. POST `runFullAnalysis` through Caddy.
    Evidence: `.sisyphus/evidence/task-16-fallback-success.txt`

- [x] 17. Prod Mode Requires FastAPI (FastAPI down, fallback disabled)

  **What to do**:
  - Run Next.js with `ALLOW_PYTHON_FALLBACK=false`.
  - With FastAPI stopped, call `runFullAnalysis` and confirm non-2xx + JSON error.

  **Recommended Agent Profile**:
  - Category: `unspecified-high`

  **Parallelization**:
  - Can Run In Parallel: NO

  **Acceptance Criteria**:
  - Response is not 2xx and includes JSON with `success:false` and non-empty `error`.

  **QA Scenarios**:
  - Scenario: fail clearly
    Tool: Bash
    Steps:
      1. POST `runFullAnalysis`.
      2. Record status code and body.
    Evidence: `.sisyphus/evidence/task-17-prod-requires-fastapi.txt`

## Standalone / Prod-ish QA (Wave 5)

- [x] 18. Standalone Build Layout Verification

  **What to do**:
  - Run `bun run build`.
  - Verify `.next/standalone` contains `public/` and `.next/static/`.

  **Recommended Agent Profile**:
  - Category: `unspecified-high`

  **Parallelization**:
  - Can Run In Parallel: NO

  **Acceptance Criteria**:
  - Evidence includes directory listing showing copied assets.

  **QA Scenarios**:
  - Scenario: build layout
    Tool: Bash
    Steps:
      1. `bun run build`
      2. List `.next/standalone` content.
    Evidence: `.sisyphus/evidence/task-18-standalone-layout.txt`

- [x] 19. Standalone Start + Key Endpoint Re-check

  **What to do**:
  - Start FastAPI.
  - Start Next.js standalone server (`bun start`).
  - Set `ALLOW_PYTHON_FALLBACK=false`.
  - Re-run Tasks 10, 11, 13 through Caddy.

  **Recommended Agent Profile**:
  - Category: `unspecified-high`

  **Parallelization**:
  - Can Run In Parallel: NO

  **Acceptance Criteria**:
  - Key endpoint checks succeed through `http://127.0.0.1:81`.

  **QA Scenarios**:
  - Scenario: standalone smoke
    Tool: PTY + Bash
    Steps:
      1. Start `bun start`.
      2. Curl `/api` and `/api/ml` actions.
    Evidence: `.sisyphus/evidence/task-19-standalone-smoke.txt`

- [x] 20. Produce Correctness Report (from evidence)

  **What to do**:
  - Create `.sisyphus/evidence/backend-correctness-report.md` summarizing:
    - what was verified
    - what failed (if anything)
    - exact repro commands
    - links to evidence files
  - Include a short “Findings” section for non-blocking risks (no auth/rate-limit, in-memory state), without implementing changes.

  **Recommended Agent Profile**:
  - Category: `writing`

  **Parallelization**:
  - Can Run In Parallel: NO (final consolidation)

  **Acceptance Criteria**:
  - Report exists and references evidence files produced by Tasks 7-19.

  **QA Scenarios**:
  - Scenario: Report references real evidence
    Tool: Bash
    Steps:
      1. Verify each referenced evidence file exists.
    Evidence: `.sisyphus/evidence/task-20-report-check.txt`

---

## Final Verification Wave (MANDATORY)

- [x] F1. Plan Compliance Audit (oracle)
  Verify each Must Have using only evidence + reruns as needed.

- [x] F2. Evidence Completeness + Log Review (unspecified-high)
  Ensure all evidence files exist and include both request output and relevant service logs.

- [x] F3. Clean Start Re-run of Critical Scenarios (unspecified-high)
  From a clean start (restart all services), re-run Tasks 10, 11, 13, 16, 17 and capture fresh evidence under `.sisyphus/evidence/final-qa/`.

- [x] F4. Scope Fidelity Check (deep)
  Confirm no work was done outside verification/reporting scope.

---

## Success Criteria

### Final Checklist
- [x] Full stack works through Caddy on `:81`
- [x] Dev fallback works (FastAPI down + fallback enabled)
- [x] Prod mode requires FastAPI (FastAPI down + fallback disabled -> clear failure)
- [x] Standalone build contains copied static/public assets
- [x] `.sisyphus/evidence/backend-correctness-report.md` exists and links evidence
