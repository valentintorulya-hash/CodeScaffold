# Decisions

Append-only. Record decisions and rationale.

## 2026-02-14 - Walk-forward weight selection (Task 3)

- Replaced single tail-window RMSE tuning with expanding-window walk-forward in `scripts/ml_backend.py`.
- Fold setup:
  - Horizon: `H = future_days`.
  - Initial train size: `max(70, look_back + 12, H * 2)`.
  - Origin stride: `max(5, min(10, max(5, H // 4)))` (for `H=30` this is 7).
  - Max origins: 16, selected as evenly spaced points from all feasible origins.
- Leakage policy: each fold uses `train_fold = values[:origin]` only. Per-model fold path is produced via existing runners with `test=[]` and `horizon=H`, then compared against `test_fold = values[origin:origin+H]`.
- LSTM runtime timebox: LSTM is evaluated only on the last `min(4, origins)` folds; fold epochs reduced to `max(1, min(6, epochs // 4))`.
- Composite score (lower is better) is computed per fold from min-max normalized terms across models:
  - `score = 0.62*rmse_norm + 0.20*flatness_norm + 0.12*monotonic_pen_norm + 0.06*zigzag_pen_norm`
  - `flatness_norm` uses existing `flatness_penalty(y_true_fold, pred_fold)`.
  - Monotonic penalty constant: `1.35` when `monotonic_flag(pred_fold) == 1`, else `1.0`.
  - Zig-zag penalty: `1.0 + max(0, sign_flip_rate(pred_fold) - 0.7) * 1.5`, capped at `1.75`.
- Per-origin composite scores are converted to per-origin weights via inverse-score weighting (`ensemble_weights_from_rmse(..., min_weight=0.0)`).
- Final weights are averaged across origins, normalized, then floors are applied and normalized again:
  - Floors: `arima=0.1`, `lstm=0.1`, `trend=0.2`, `returns=0.2`.
- Added top-level `walk_forward` summary to analysis response with `origins`, `rmse_mean`, `monotonic_rate`, plus `diff_vol_ratio_mean` and `sign_flip_rate_mean`.
