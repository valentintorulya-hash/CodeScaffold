# Learnings

Append-only. Store patterns, conventions, and helpful implementation notes.

## 2026-02-14 - Backend realism metrics (Task 1)

- Added deterministic helpers in `scripts/ml_backend.py` that only use finite floats and `sanitize_number`:
  - `monotonic_flag(values)`: returns `1.0` when all diffs are non-decreasing or non-increasing (epsilon-aware), else `0.0`.
  - `monotonic_run_max(values)`: max run length of consecutive same-sign diffs (`+` or `-`), zeros break runs.
  - `diff_vol_ratio(pred, history, history_window)`: `std(diff(pred)) / max(std(diff(history_last_N)), 1e-8)` with finite fallback.
  - `sign_flip_rate(values)`: share of sign changes across non-zero diffs.
- Thresholds/constants used now: `diff_eps=1e-8`, near-zero std guard `1e-8`, and history window `N` from recent history (`max(20, min(60, len(values)))` for future metrics).
- Metrics are computed backend-only in `analyze()` under top-level key `realism_metrics`; forecast payload shape remains unchanged.

## 2026-02-14 - Hybrid future path rework (Task 2)

- Replaced level-space weighted future blend in `scripts/ml_backend.py` with deterministic diff-space blending:
  - `last_close = values[-1]`
  - Per-model deltas via `np.diff(np.concatenate([[last_close], model_future]))`
  - Weighted blend in delta space and integration back to levels.
- Removed drift-inducing post-processing from future path computation (no calls to `align_forecast_to_last_value()` and `shape_forecast_with_recent_volatility()` in `analyze()`).
- Robust delta scale now uses history diffs from `N = max(30, min(60, len(history)))` with MAD sigma (`1.4826 * MAD`) and finite fallback chain (`IQR/1.349` -> `std` -> `mean(abs(diff))`).
- Bounded step dynamics constants:
  - Sigma floor: `max(abs(last_close) * 1e-5, 1e-4)`
  - Step cap multiplier `k`: linear schedule `2.2 -> 2.8` across horizon.
- Light mean reversion (level space):
  - Anchor: `median(last 20 closes)`
  - Reversion strength schedule: `0.01 -> 0.12` across horizon.
- Zig-zag guard uses acceleration clamp on delta change per step:
  - Acceleration multiplier schedule: `0.9 -> 1.25` times robust sigma (with same sigma floor).
