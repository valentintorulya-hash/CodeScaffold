# Draft: Backend Correctness Check

## User Request
- "проверь корректность работы бэкэнда проекта"

## What We Know So Far (from repo inspection)
- Backend surface appears minimal: `src/app/api/route.ts` implements only `GET()` returning JSON `{ message: "Привет, мир!" }`.
- Main backend logic is actually in `src/app/api/ml/route.ts`: `POST(req: Request)` with multiple `action` modes (healthCheck, getDataPreview, runFullAnalysis, forecastFuture, etc.).
- `/api/ml` is pinned to Node runtime (`export const runtime = "nodejs"`) and can call:
  - a persistent FastAPI service (`scripts/ml_service.py`, default URL `http://127.0.0.1:8000`)
  - a Python subprocess fallback (`scripts/ml_backend.py`) via `child_process.spawn`
- App runtime is Next.js (`next dev -p 3000`), and `Caddyfile` proxies `:81` -> `localhost:3000` by default (optionally proxying to a port from `XTransformPort` query param).
- Prisma is configured (SQLite) with `DATABASE_URL` env var; singleton client exported as `db` in `src/lib/db.ts`.
- `next.config.ts` sets `output: "standalone"` and `typescript.ignoreBuildErrors = true` (build may succeed with TS errors).
- `next-auth` is listed as a dependency, but no `api/auth/[...nextauth]` routes were discovered in `src/` (likely unused for now).

## Backend Env Vars (observed)
- `DATABASE_URL` (Prisma SQLite)
- `/api/ml`:
  - `USE_FASTAPI_SERVICE` (default true; set to "false" to disable)
  - `ALLOW_PYTHON_FALLBACK` (default true; set to "false" to disable)
  - `ML_SERVICE_URL` (default `http://127.0.0.1:8000`)
  - `ML_SERVICE_TIMEOUT_MS` (default 1800000; clamped 60000..3600000)
  - `PYTHON_BIN` (default `python`)

## Key Risks / Hypotheses
- "Backend" may mean different things here (Next.js API routes vs standalone node server, reverse proxy setup, Prisma DB ops, websocket example if present).
- Build correctness signal is weak because TS errors are ignored.
- Prisma schema has `User` and `Post` but no explicit `@relation` between them; may or may not be intentional.
- `/api/ml` has no authentication or rate limiting while allowing heavy compute + external network calls (DoS risk).
- `/api/ml` uses in-memory state (`latestAnalysis` + MOEX cache) shared across requests/users within a single Node process; behavior will differ across restarts/multi-instance deployments.

## Open Questions
- What do you consider the backend in this project?
  - Next.js API routes only?
  - Prisma DB layer too?
  - Caddy reverse-proxy wiring?
  - Any separate services/scripts (e.g., websocket example, mini-services)?
- What environment should be supported: local dev only, or also standalone production start (`bun run build` + `bun start`)?

## Decisions (user)
- Target runtime selected: Full stack (Caddy :81 + Next.js :3000 + FastAPI ML :8000).
- FastAPI outage behavior: Dev-only fallback (python subprocess allowed in dev; prod should treat FastAPI as required).

## Next Evidence To Gather
- Locate any additional API routes, middleware, server actions.
- Inspect `scripts/postbuild-copy.mjs` and `scripts/start-standalone.mjs`.
- Identify required env vars (`DATABASE_URL`, NextAuth secrets/providers if used).
