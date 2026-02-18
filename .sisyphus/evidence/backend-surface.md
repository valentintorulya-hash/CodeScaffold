# Backend Surface Inventory (Task 1)

- `src/app/api/route.ts`: Next.js `GET` route that returns JSON `{ "message": "Привет, мир!" }` via `NextResponse`; useful as a minimal API availability check.
- `src/app/api/ml/route.ts`: Next.js `POST` ML gateway handling actions (`healthCheck`, `getDataPreview`, `runFullAnalysis`, `forecastFuture`, etc.), with MOEX fetch/cache and FastAPI -> Python fallback behavior behind env flags.
- `scripts/ml_service.py`: Persistent FastAPI service exposing `/health`, `/analyze`, and `/forecast`, with per-request seed reset and a global async lock to serialize TensorFlow-heavy operations.
- `scripts/ml_backend.py`: Core Python ML implementation (data prep, ARIMA/LSTM/baseline models, walk-forward weighting, forecasting) used by both FastAPI service and subprocess fallback mode.
- `Caddyfile`: Caddy reverse proxy on `:81` forwarding by default to `localhost:3000`, with an alternate query-driven route (`XTransformPort`) for dynamic upstream port forwarding.
