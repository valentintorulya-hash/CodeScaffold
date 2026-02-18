# Backend Env Var Matrix (Task 3)

| Variable | Dev expectation | Prod expectation | Default | Usage in source/config |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | Required | Required | No code default (resolved by Prisma `env("DATABASE_URL")`) | `prisma/schema.prisma:13` |
| `USE_FASTAPI_SERVICE` | Optional; keep `true` to prefer FastAPI | Required to be `true` | `true` when unset (`process.env... !== "false"`) | `src/app/api/ml/route.ts:8`, `src/app/api/ml/route.ts:372` |
| `ALLOW_PYTHON_FALLBACK` | Optional; keep `true` for dev fallback resilience | Must be `false` (no-fallback expectation) | `true` when unset (`process.env... !== "false"`) | `src/app/api/ml/route.ts:9`, `src/app/api/ml/route.ts:378`, `src/app/api/ml/route.ts:391` |
| `ML_SERVICE_URL` | Optional if default endpoint is valid | Required if FastAPI is not at default URL | `http://127.0.0.1:8000` | `src/app/api/ml/route.ts:10`, `src/app/api/ml/route.ts:261`, `src/app/api/ml/route.ts:288` |
| `ML_SERVICE_TIMEOUT_MS` | Optional override | Optional override | `1800000` ms (30 min), clamped to `60000..3600000` | `src/app/api/ml/route.ts:11`, `src/app/api/ml/route.ts:263` |
| `PYTHON_BIN` | Optional override for fallback subprocess | Optional, only relevant if fallback path is used intentionally | `python` | `src/app/api/ml/route.ts:301` |

## Mode Notes

- Dev fallback behavior: with `USE_FASTAPI_SERVICE=true` and `ALLOW_PYTHON_FALLBACK=true` (both defaults), the route attempts FastAPI first and falls back to Python subprocess on FastAPI failure/unavailability.
- Prod no-fallback expectation: set `ALLOW_PYTHON_FALLBACK=false` while keeping `USE_FASTAPI_SERVICE=true`; in this mode, FastAPI outage returns a clear server error instead of running Python fallback.
