# Backend Runbook (Task 2)

## Startup order and ports

1. **FastAPI ML service first** - start `scripts/ml_service.py` on `127.0.0.1:8000` (default from `ML_SERVICE_PORT`, fallback default is `8000`).
2. **Next.js app second** - start `bun run dev` (from `package.json`), which runs `next dev -p 3000` on `:3000`.
3. **Caddy proxy third** - start Caddy with `Caddyfile`; it listens on `:81` and reverse-proxies to `localhost:3000`.

Required order: **FastAPI (:8000) -> Next.js (:3000) -> Caddy (:81)**.

## Mode configuration

### Dev fallback mode

Use:

- `USE_FASTAPI_SERVICE=true`
- `ALLOW_PYTHON_FALLBACK=true`

Behavior in `src/app/api/ml/route.ts`:

- Route attempts FastAPI (`ML_SERVICE_URL` + endpoint) first.
- If FastAPI is down or call fails, route falls back to Python subprocess (`pythonExec`) using `scripts/ml_backend.py`.

### Prod no-fallback mode

Use:

- `USE_FASTAPI_SERVICE=true`
- `ALLOW_PYTHON_FALLBACK=false`

Behavior in `src/app/api/ml/route.ts`:

- Route requires FastAPI availability.
- If FastAPI is unavailable or request fails, route returns error (`ML service is unavailable and fallback is disabled`) instead of spawning Python.

## Startup-related environment variables

- `DATABASE_URL` - Prisma datasource URL (`prisma/schema.prisma` uses `env("DATABASE_URL")`).
- `USE_FASTAPI_SERVICE` - feature flag; default enabled unless explicitly set to `false`.
- `ALLOW_PYTHON_FALLBACK` - fallback flag; default enabled unless explicitly set to `false`.
- `ML_SERVICE_URL` - FastAPI base URL (default `http://127.0.0.1:8000`).
- `ML_SERVICE_TIMEOUT_MS` - FastAPI request timeout in ms (default `1800000`, clamped in route).
- `PYTHON_BIN` - Python executable for fallback subprocess (default `python`).

## Operator commands (do not run in this task)

- Start FastAPI: `python scripts/ml_service.py`
- Start Next.js: `bun run dev`
- Start Caddy: `caddy run --config Caddyfile`

## Current machine blocker

- `caddy` is currently missing in `PATH` in this environment, so proxy startup on `:81` is blocked until Caddy is installed or PATH is fixed.

## Source references used

- `package.json`
- `Caddyfile`
- `scripts/ml_service.py`
- `src/app/api/ml/route.ts`
