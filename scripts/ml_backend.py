import json
import math
import os
import random
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("NUMEXPR_NUM_THREADS", "1")

import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.preprocessing import MinMaxScaler
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.stattools import adfuller, kpss
import tensorflow as tf


ARIMA_CANDIDATE_ORDERS: list[tuple[int, int, int]] = [
    (1, 1, 1),
    (2, 1, 1),
    (1, 1, 2),
    (2, 1, 2),
    (0, 1, 1),
]
_default_arima_workers = max(1, min(3, len(ARIMA_CANDIDATE_ORDERS), int(os.cpu_count() or 1)))
ARIMA_ORDER_WORKERS = max(
    1,
    min(
        len(ARIMA_CANDIDATE_ORDERS),
        int(os.environ.get("ARIMA_ORDER_WORKERS", str(_default_arima_workers))),
    ),
)
ARIMA_EXECUTOR = ThreadPoolExecutor(max_workers=ARIMA_ORDER_WORKERS) if ARIMA_ORDER_WORKERS > 1 else None


def to_float_list(values: list[Any]) -> list[float]:
    out: list[float] = []
    for value in values:
        try:
            n = float(value)
            if math.isfinite(n):
                out.append(n)
        except Exception:
            continue
    return out


def moving_confidence_bounds(values: np.ndarray, std: float) -> tuple[list[float], list[float]]:
    lower = (values - 1.96 * std).tolist()
    upper = (values + 1.96 * std).tolist()
    return lower, upper


def safe_mape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    eps = np.finfo(np.float64).eps
    denom = np.maximum(np.abs(y_true), eps)
    return float(np.mean(np.abs((y_true - y_pred) / denom)) * 100.0)


def sanitize_number(value: float) -> float:
    if not math.isfinite(value):
        return 0.0
    return float(value)


def build_windows(series_scaled: np.ndarray, look_back: int):
    x = []
    y = []
    for i in range(look_back, len(series_scaled)):
        x.append(series_scaled[i - look_back : i])
        y.append(series_scaled[i])
    if not x:
        return np.empty((0, look_back, 1)), np.empty((0, 1))
    return np.array(x), np.array(y)


def ensure_window(values: list[float], look_back: int) -> list[float]:
    if len(values) >= look_back:
        return values[-look_back:]
    if not values:
        return [0.0] * look_back
    return [values[0]] * (look_back - len(values)) + values


def estimate_local_dynamics(history: list[float], window: int = 24) -> tuple[float, float]:
    if len(history) <= 2:
        return 0.0, 0.0

    segment = history[-window:] if len(history) > window else history
    if len(segment) <= 2:
        return 0.0, 0.0

    diffs = np.diff(np.array(segment, dtype=float))
    velocity_window = min(5, len(diffs))
    velocity = float(np.mean(diffs[-velocity_window:])) if velocity_window > 0 else 0.0

    if len(diffs) >= 3:
        acceleration_diffs = np.diff(diffs)
        accel_window = min(4, len(acceleration_diffs))
        acceleration = float(np.mean(acceleration_diffs[-accel_window:])) if accel_window > 0 else 0.0
    else:
        acceleration = 0.0

    return velocity, acceleration


def estimate_step_limit(history: list[float], window: int = 30) -> float:
    if len(history) <= 2:
        return 1.0

    segment = history[-window:] if len(history) > window else history
    if len(segment) <= 2:
        return 1.0

    diffs = np.diff(np.array(segment, dtype=float))
    recent_window = min(5, len(diffs))
    recent_mean = float(np.mean(diffs[-recent_window:])) if recent_window > 0 else 0.0
    std = float(np.std(diffs))
    return max(1.0, 3.0 * std, abs(recent_mean) * 2.0)


def run_trend_baseline(
    train: np.ndarray,
    test: np.ndarray,
    horizon: int,
    block_size: int,
) -> tuple[np.ndarray, np.ndarray, float]:
    start = time.time()
    history = train.tolist()

    pred_test: list[float] = []
    test_cursor = 0
    while test_cursor < len(test):
        current_block = min(block_size, len(test) - test_cursor)
        velocity, acceleration = estimate_local_dynamics(history)
        step_limit = estimate_step_limit(history)
        anchor = float(history[-1]) if history else 0.0
        block: list[float] = []
        for i in range(current_block):
            raw_step = velocity + acceleration * float(i)
            step = max(-step_limit, min(step_limit, raw_step))
            anchor = anchor + step
            block.append(anchor)
        pred_test.extend(block)

        history.extend(test[test_cursor : test_cursor + current_block].tolist())
        test_cursor += current_block

    pred_future: list[float] = []
    while len(pred_future) < horizon:
        current_block = min(block_size, horizon - len(pred_future))
        velocity, acceleration = estimate_local_dynamics(history)
        step_limit = estimate_step_limit(history)
        anchor = float(history[-1]) if history else 0.0
        block: list[float] = []
        for i in range(current_block):
            raw_step = velocity + acceleration * float(i)
            step = max(-step_limit, min(step_limit, raw_step))
            anchor = anchor + step
            block.append(anchor)
        pred_future.extend(block)
        history.extend(block)

    elapsed = time.time() - start
    return np.array(pred_test, dtype=float), np.array(pred_future, dtype=float), elapsed


def project_recent_returns(history: list[float], steps: int) -> list[float]:
    if steps <= 0 or len(history) <= 3:
        return [0.0] * max(0, steps)

    window = history[-40:] if len(history) > 40 else history
    returns = np.diff(np.array(window, dtype=float))
    if len(returns) <= 1:
        return [0.0] * steps

    local_mean_window = min(7, len(returns))
    local_mean = float(np.mean(returns[-local_mean_window:])) if local_mean_window > 0 else 0.0
    centered = returns - np.mean(returns)
    volatility = float(np.std(returns))
    if volatility <= 1e-8:
        return [local_mean] * steps

    output: list[float] = []
    step_limit = max(1.0, volatility * 2.5)
    for i in range(steps):
        seasonal = float(centered[i % len(centered)])
        decay = math.exp(-float(i) / 10.0)
        step = local_mean * 0.75 + seasonal * 0.45 * decay
        bounded = max(-step_limit, min(step_limit, step))
        output.append(bounded)

    return output


def run_returns_baseline(
    train: np.ndarray,
    test: np.ndarray,
    horizon: int,
    block_size: int,
) -> tuple[np.ndarray, np.ndarray, float]:
    start = time.time()
    history = train.tolist()

    pred_test: list[float] = []
    test_cursor = 0
    while test_cursor < len(test):
        current_block = min(block_size, len(test) - test_cursor)
        steps = project_recent_returns(history, current_block)
        anchor = float(history[-1]) if history else 0.0
        block: list[float] = []
        for step in steps:
            anchor = anchor + step
            block.append(anchor)

        pred_test.extend(block)
        history.extend(test[test_cursor : test_cursor + current_block].tolist())
        test_cursor += current_block

    pred_future: list[float] = []
    while len(pred_future) < horizon:
        current_block = min(block_size, horizon - len(pred_future))
        steps = project_recent_returns(history, current_block)
        anchor = float(history[-1]) if history else 0.0
        block: list[float] = []
        for step in steps:
            anchor = anchor + step
            block.append(anchor)

        pred_future.extend(block)
        history.extend(block)

    elapsed = time.time() - start
    return np.array(pred_test, dtype=float), np.array(pred_future, dtype=float), elapsed


def run_lstm(
    train: np.ndarray,
    test: np.ndarray,
    full: np.ndarray,
    look_back: int,
    units1: int,
    units2: int,
    epochs: int,
    batch_size: int,
    horizon: int,
    block_size: int,
) -> tuple[np.ndarray, np.ndarray, float]:
    start = time.time()

    scaler = MinMaxScaler(feature_range=(0, 1))
    train_scaled = scaler.fit_transform(train.reshape(-1, 1))

    x_train, y_train = build_windows(train_scaled, look_back)
    if len(x_train) == 0:
        last_value = float(train[-1]) if len(train) else 0.0
        return np.full(len(test), last_value), np.full(horizon, last_value), 0.0

    tf.keras.backend.clear_session()
    model = tf.keras.Sequential(
        [
            tf.keras.layers.Input(shape=(look_back, 1)),
            tf.keras.layers.LSTM(max(4, units1), return_sequences=True),
            tf.keras.layers.LSTM(max(4, units2)),
            tf.keras.layers.Dense(1),
        ]
    )
    model.compile(optimizer="adam", loss="mse")
    model.fit(
        x_train,
        y_train,
        epochs=max(1, epochs),
        batch_size=max(1, batch_size),
        verbose=0,
    )

    history_scaled = train_scaled.reshape(-1).tolist()
    test_scaled = scaler.transform(test.reshape(-1, 1)).reshape(-1) if len(test) else np.empty((0,), dtype=float)
    test_pred_scaled: list[float] = []

    test_cursor = 0
    while test_cursor < len(test_scaled):
        current_block = min(block_size, len(test_scaled) - test_cursor)
        rolling = ensure_window(history_scaled, look_back)

        for _ in range(current_block):
            x_input = np.array(rolling[-look_back:], dtype=float).reshape(1, look_back, 1)
            pred_scaled = float(model.predict(x_input, verbose=0).flatten()[0])
            test_pred_scaled.append(pred_scaled)
            rolling.append(pred_scaled)

        history_scaled.extend(test_scaled[test_cursor : test_cursor + current_block].tolist())
        test_cursor += current_block

    test_pred = (
        scaler.inverse_transform(np.array(test_pred_scaled, dtype=float).reshape(-1, 1)).flatten()
        if test_pred_scaled
        else np.empty((0,), dtype=float)
    )

    full_scaled = scaler.transform(full.reshape(-1, 1)).reshape(-1).tolist()
    future_scaled: list[float] = []
    while len(future_scaled) < horizon:
        current_block = min(block_size, horizon - len(future_scaled))
        rolling = ensure_window(full_scaled, look_back)
        block_predictions: list[float] = []

        for _ in range(current_block):
            x_input = np.array(rolling[-look_back:], dtype=float).reshape(1, look_back, 1)
            pred_scaled = float(model.predict(x_input, verbose=0).flatten()[0])
            block_predictions.append(pred_scaled)
            rolling.append(pred_scaled)

        future_scaled.extend(block_predictions)
        full_scaled.extend(block_predictions)

    future_values = (
        scaler.inverse_transform(np.array(future_scaled, dtype=float).reshape(-1, 1)).flatten()
        if future_scaled
        else np.empty((0,), dtype=float)
    )
    elapsed = time.time() - start
    return test_pred, future_values, elapsed


def _fit_arima_candidate(history: np.ndarray, order: tuple[int, int, int]):
    try:
        model = ARIMA(history, order=order).fit()
        aic = float(model.aic) if math.isfinite(float(model.aic)) else float("inf")
        return order, aic, model
    except Exception:
        return order, float("inf"), None


def fit_best_arima_model(history: np.ndarray):
    candidate_orders = ARIMA_CANDIDATE_ORDERS
    best_model = None
    best_aic = float("inf")

    results_by_order: dict[tuple[int, int, int], tuple[float, Any | None]] = {}
    if ARIMA_EXECUTOR is None:
        for order in candidate_orders:
            _, aic, model = _fit_arima_candidate(history, order)
            results_by_order[order] = (aic, model)
    else:
        futures = [ARIMA_EXECUTOR.submit(_fit_arima_candidate, history, order) for order in candidate_orders]
        for future in as_completed(futures):
            order, aic, model = future.result()
            results_by_order[order] = (aic, model)

    for order in candidate_orders:
        aic, model = results_by_order.get(order, (float("inf"), None))
        if model is not None and aic < best_aic:
            best_aic = aic
            best_model = model

    return best_model


def arima_forecast(history: np.ndarray, steps: int) -> np.ndarray:
    if steps <= 0:
        return np.empty((0,), dtype=float)

    try:
        fitted = fit_best_arima_model(history)
        if fitted is None:
            raise ValueError("ARIMA fit failed for all candidate orders")

        forecast = np.array(fitted.forecast(steps=steps), dtype=float)
        if len(forecast) != steps or not np.all(np.isfinite(forecast)):
            raise ValueError("ARIMA forecast contains invalid values")
        return forecast
    except Exception:
        last = float(history[-1]) if len(history) else 0.0
        return np.full(steps, last)


def run_arima(train: np.ndarray, test: np.ndarray, horizon: int, block_size: int) -> tuple[np.ndarray, np.ndarray, float]:
    start = time.time()

    history = train.tolist()
    pred_test: list[float] = []
    test_cursor = 0

    while test_cursor < len(test):
        current_block = min(block_size, len(test) - test_cursor)
        fc = arima_forecast(np.array(history, dtype=float), current_block)
        pred_test.extend(fc.tolist())
        history.extend(test[test_cursor : test_cursor + current_block].tolist())
        test_cursor += current_block

    pred_future: list[float] = []
    while len(pred_future) < horizon:
        current_block = min(block_size, horizon - len(pred_future))
        fc = arima_forecast(np.array(history, dtype=float), current_block)
        values = fc.tolist()
        pred_future.extend(values)
        history.extend(values)

    elapsed = time.time() - start
    return np.array(pred_test, dtype=float), np.array(pred_future, dtype=float), elapsed


def stationarity_report(series: np.ndarray) -> dict[str, Any]:
    adf_stat, adf_p = 0.0, 1.0
    kpss_stat, kpss_p = 0.0, 1.0

    try:
        adf_res = adfuller(series, autolag="AIC")
        adf_stat = float(adf_res[0])
        adf_p = float(adf_res[1])
    except Exception:
        pass

    try:
        kpss_res = kpss(series, regression="c", nlags="auto")
        kpss_stat = float(kpss_res[0])
        kpss_p = float(kpss_res[1])
    except Exception:
        pass

    adf_stationary = adf_p < 0.05
    kpss_stationary = kpss_p > 0.05

    if adf_stationary and kpss_stationary:
        stationarity_type = "Ряд стационарен"
    elif (not adf_stationary) and (not kpss_stationary):
        stationarity_type = "Ряд нестационарен"
    else:
        stationarity_type = "Пограничная стационарность (нужна дополнительная проверка)"

    return {
        "adf": {
            "test_statistic": sanitize_number(adf_stat),
            "p_value": sanitize_number(adf_p),
            "is_stationary": adf_stationary,
            "interpretation": "Стационарен (p < 0.05)" if adf_stationary else "Нестационарен (p >= 0.05)",
        },
        "kpss": {
            "test_statistic": sanitize_number(kpss_stat),
            "p_value": sanitize_number(kpss_p),
            "is_stationary": kpss_stationary,
        },
        "stationarity_type": stationarity_type,
    }


def evaluate_model(name: str, y_true: np.ndarray, y_pred: np.ndarray, elapsed: float):
    mae = sanitize_number(mean_absolute_error(y_true, y_pred))
    rmse = sanitize_number(math.sqrt(mean_squared_error(y_true, y_pred)))
    mape = sanitize_number(safe_mape(y_true, y_pred))
    r2 = sanitize_number(r2_score(y_true, y_pred))
    return {
        "Model": name,
        "MAE": mae,
        "RMSE": rmse,
        "MAPE": mape,
        "R2": r2,
        "Время (сек)": sanitize_number(elapsed),
    }


def ensemble_weights_from_rmse(rmse_values: dict[str, float], min_weight: float = 0.1) -> dict[str, float]:
    eps = 1e-8
    keys = list(rmse_values.keys())
    if not keys:
        return {}

    inverse = {key: 1.0 / max(float(rmse_values[key]), eps) for key in keys}
    total_inverse = sum(inverse.values())
    if total_inverse <= 0:
        equal_weight = 1.0 / float(len(keys))
        return {key: equal_weight for key in keys}

    raw = {key: inverse[key] / total_inverse for key in keys}
    clamped = {key: max(min_weight, raw[key]) for key in keys}
    clamped_total = sum(clamped.values())
    if clamped_total <= 0:
        equal_weight = 1.0 / float(len(keys))
        return {key: equal_weight for key in keys}

    return {key: clamped[key] / clamped_total for key in keys}


def flatness_penalty(y_true: np.ndarray, y_pred: np.ndarray, min_ratio: float = 0.7) -> float:
    if len(y_true) <= 3 or len(y_pred) <= 3:
        return 1.0

    true_diff = np.diff(y_true)
    pred_diff = np.diff(y_pred)
    true_std = float(np.std(true_diff))
    pred_std = float(np.std(pred_diff))

    if true_std <= 1e-8:
        return 1.0

    ratio = pred_std / true_std
    if ratio >= min_ratio:
        return 1.0

    gap = min_ratio - max(0.0, ratio)
    return 1.0 + gap * 2.0


def monotonic_flag(values: np.ndarray, eps: float = 1e-8) -> float:
    if len(values) <= 2:
        return 1.0

    diffs = np.diff(np.array(values, dtype=float))
    if len(diffs) == 0:
        return 1.0

    is_non_decreasing = bool(np.all(diffs >= -eps))
    is_non_increasing = bool(np.all(diffs <= eps))
    return 1.0 if (is_non_decreasing or is_non_increasing) else 0.0


def monotonic_run_max(values: np.ndarray, eps: float = 1e-8) -> float:
    if len(values) <= 2:
        return 0.0

    diffs = np.diff(np.array(values, dtype=float))
    if len(diffs) == 0:
        return 0.0

    signs = np.where(diffs > eps, 1, np.where(diffs < -eps, -1, 0))
    max_run = 0
    current_run = 0
    current_sign = 0

    for sign in signs.tolist():
        if sign == 0:
            current_run = 0
            current_sign = 0
            continue

        if sign == current_sign:
            current_run += 1
        else:
            current_sign = sign
            current_run = 1

        if current_run > max_run:
            max_run = current_run

    return sanitize_number(float(max_run))


def diff_vol_ratio(pred: np.ndarray, history: np.ndarray, history_window: int = 30) -> float:
    pred_arr = np.array(pred, dtype=float)
    hist_arr = np.array(history, dtype=float)
    if len(pred_arr) <= 2 or len(hist_arr) <= 2:
        return 0.0

    pred_diff = np.diff(pred_arr)
    if len(pred_diff) == 0:
        return 0.0

    window = max(3, int(history_window))
    hist_slice = hist_arr[-window:] if len(hist_arr) > window else hist_arr
    hist_diff = np.diff(hist_slice)
    if len(hist_diff) == 0:
        return 0.0

    pred_std = float(np.std(pred_diff))
    hist_std = float(np.std(hist_diff))
    ratio = pred_std / max(hist_std, 1e-8)
    return sanitize_number(ratio)


def sign_flip_rate(values: np.ndarray, eps: float = 1e-8) -> float:
    if len(values) <= 3:
        return 0.0

    diffs = np.diff(np.array(values, dtype=float))
    if len(diffs) <= 1:
        return 0.0

    signs = np.where(diffs > eps, 1, np.where(diffs < -eps, -1, 0))
    non_zero_signs = signs[signs != 0]
    if len(non_zero_signs) <= 1:
        return 0.0

    flips = float(np.sum(non_zero_signs[1:] != non_zero_signs[:-1]))
    denom = float(len(non_zero_signs) - 1)
    if denom <= 0:
        return 0.0
    return sanitize_number(flips / denom)


def min_max_normalize(values: dict[str, float], eps: float = 1e-8) -> dict[str, float]:
    if not values:
        return {}

    numeric = {key: float(value) for key, value in values.items()}
    min_value = min(numeric.values())
    max_value = max(numeric.values())
    span = max_value - min_value
    if span <= eps:
        return {key: 0.0 for key in numeric.keys()}
    return {key: (value - min_value) / span for key, value in numeric.items()}


def select_walk_forward_origins(
    total_len: int,
    horizon: int,
    min_train_size: int,
    origin_step: int,
    max_origins: int,
    look_back: int,
) -> list[int]:
    if total_len <= 0 or horizon <= 0:
        return []

    last_origin = int(total_len - horizon)
    min_origin = int(max(min_train_size, look_back + 5, 30))
    if last_origin <= min_origin:
        return [last_origin] if last_origin > look_back else []

    step = max(1, int(origin_step))
    origins = list(range(min_origin, last_origin + 1, step))
    if not origins:
        origins = [last_origin]

    if len(origins) <= max_origins:
        return origins

    picks = np.linspace(0, len(origins) - 1, num=max_origins)
    selected: list[int] = []
    used: set[int] = set()
    for pick in picks.tolist():
        idx = int(round(float(pick)))
        idx = max(0, min(len(origins) - 1, idx))
        if idx in used:
            continue
        selected.append(origins[idx])
        used.add(idx)

    if origins[-1] not in selected:
        selected.append(origins[-1])

    return sorted(selected)


def walk_forward_weight_selection(
    values: np.ndarray,
    future_days: int,
    forecast_block: int,
    look_back: int,
    units1: int,
    units2: int,
    epochs: int,
    batch_size: int,
    min_floors: dict[str, float],
) -> tuple[dict[str, float], dict[str, Any]]:
    model_keys = ["arima", "lstm", "trend", "returns"]
    horizon = max(1, int(future_days))
    total_len = int(len(values))

    min_train_size = max(70, look_back + 12, horizon * 2)
    origin_step = max(5, min(10, max(5, horizon // 4)))
    max_origins = 16
    origins = select_walk_forward_origins(
        total_len=total_len,
        horizon=horizon,
        min_train_size=min_train_size,
        origin_step=origin_step,
        max_origins=max_origins,
        look_back=look_back,
    )

    if not origins:
        equal_weight = 1.0 / float(len(model_keys))
        return (
            {key: equal_weight for key in model_keys},
            {
                "origins": 0,
                "rmse_mean": 0.0,
                "monotonic_rate": 0.0,
                "diff_vol_ratio_mean": 0.0,
                "sign_flip_rate_mean": 0.0,
                "origin_step": int(origin_step),
                "horizon": int(horizon),
                "lstm_origins": 0,
                "lstm_epochs": 0,
            },
        )

    lstm_origins_target = min(4, len(origins))
    lstm_start_idx = max(0, len(origins) - lstm_origins_target)
    lstm_epochs = max(1, min(6, int(max(1, epochs // 4))))

    rmse_weight = 0.62
    flatness_weight = 0.2
    monotonic_weight = 0.12
    zigzag_weight = 0.06
    monotonic_penalty_value = 1.35
    zigzag_threshold = 0.7
    zigzag_scale = 1.5
    zigzag_penalty_cap = 1.75

    weight_sums = {key: 0.0 for key in model_keys}
    weight_counts = {key: 0 for key in model_keys}
    origin_rmse_values: list[float] = []
    origin_monotonic_flags: list[float] = []
    origin_diff_vol_ratios: list[float] = []
    origin_sign_flip_rates: list[float] = []
    lstm_used = 0

    empty_test = np.empty((0,), dtype=float)

    for fold_idx, origin in enumerate(origins):
        train_fold = np.array(values[:origin], dtype=float)
        test_fold = np.array(values[origin : origin + horizon], dtype=float)
        if len(train_fold) <= 1 or len(test_fold) != horizon:
            continue

        last_value = float(train_fold[-1])
        model_paths: dict[str, np.ndarray] = {}

        _, arima_future_fold, _ = run_arima(train_fold, empty_test, horizon, forecast_block)
        model_paths["arima"] = sanitize_future_path(arima_future_fold, horizon, last_value)

        _, trend_future_fold, _ = run_trend_baseline(train_fold, empty_test, horizon, forecast_block)
        model_paths["trend"] = sanitize_future_path(trend_future_fold, horizon, last_value)

        _, returns_future_fold, _ = run_returns_baseline(train_fold, empty_test, horizon, forecast_block)
        model_paths["returns"] = sanitize_future_path(returns_future_fold, horizon, last_value)

        evaluate_lstm = fold_idx >= lstm_start_idx
        if evaluate_lstm:
            fold_max_look_back = max(10, min(60, len(train_fold) // 4))
            fold_look_back = max(5, min(look_back, fold_max_look_back))
            _, lstm_future_fold, _ = run_lstm(
                train_fold,
                empty_test,
                train_fold,
                fold_look_back,
                units1,
                units2,
                lstm_epochs,
                batch_size,
                horizon,
                forecast_block,
            )
            model_paths["lstm"] = sanitize_future_path(lstm_future_fold, horizon, last_value)
            lstm_used += 1

        rmse_values: dict[str, float] = {}
        flatness_values: dict[str, float] = {}
        monotonic_values: dict[str, float] = {}
        zigzag_values: dict[str, float] = {}

        for model_name, pred in model_paths.items():
            rmse = sanitize_number(math.sqrt(mean_squared_error(test_fold, pred)))
            flatness = sanitize_number(flatness_penalty(test_fold, pred))
            is_monotonic = monotonic_flag(pred)
            flip_rate = sign_flip_rate(pred)

            monotonic_penalty = monotonic_penalty_value if is_monotonic >= 1.0 else 1.0
            zigzag_penalty = 1.0
            if flip_rate > zigzag_threshold:
                zigzag_penalty += (float(flip_rate) - zigzag_threshold) * zigzag_scale
            zigzag_penalty = min(zigzag_penalty_cap, zigzag_penalty)

            rmse_values[model_name] = rmse
            flatness_values[model_name] = flatness
            monotonic_values[model_name] = sanitize_number(monotonic_penalty)
            zigzag_values[model_name] = sanitize_number(zigzag_penalty)

        rmse_norm = min_max_normalize(rmse_values)
        flatness_norm = min_max_normalize(flatness_values)
        monotonic_norm = min_max_normalize(monotonic_values)
        zigzag_norm = min_max_normalize(zigzag_values)

        composite_scores: dict[str, float] = {}
        for model_name in model_paths.keys():
            score = (
                rmse_weight * rmse_norm.get(model_name, 0.0)
                + flatness_weight * flatness_norm.get(model_name, 0.0)
                + monotonic_weight * monotonic_norm.get(model_name, 0.0)
                + zigzag_weight * zigzag_norm.get(model_name, 0.0)
            )
            composite_scores[model_name] = sanitize_number(max(0.0, score))

        origin_weights = ensemble_weights_from_rmse(composite_scores, min_weight=0.0)
        if not origin_weights:
            continue

        for model_name, weight in origin_weights.items():
            weight_sums[model_name] += float(weight)
            weight_counts[model_name] += 1

        fallback_path = np.full(horizon, last_value, dtype=float)
        hybrid_future_fold = build_hybrid_future_levels(
            last_close=last_value,
            history=train_fold,
            horizon=horizon,
            arima_future=model_paths.get("arima", fallback_path),
            lstm_future=model_paths.get("lstm", fallback_path),
            trend_future=model_paths.get("trend", fallback_path),
            returns_future=model_paths.get("returns", fallback_path),
            arima_weight=float(origin_weights.get("arima", 0.0)),
            lstm_weight=float(origin_weights.get("lstm", 0.0)),
            trend_weight=float(origin_weights.get("trend", 0.0)),
            returns_weight=float(origin_weights.get("returns", 0.0)),
        )

        fold_rmse = sanitize_number(math.sqrt(mean_squared_error(test_fold, hybrid_future_fold)))
        fold_monotonic = sanitize_number(monotonic_flag(hybrid_future_fold))
        fold_diff_vol_ratio = sanitize_number(
            diff_vol_ratio(hybrid_future_fold, train_fold, history_window=max(20, min(60, len(train_fold))))
        )
        fold_sign_flip_rate = sanitize_number(sign_flip_rate(hybrid_future_fold))

        origin_rmse_values.append(fold_rmse)
        origin_monotonic_flags.append(fold_monotonic)
        origin_diff_vol_ratios.append(fold_diff_vol_ratio)
        origin_sign_flip_rates.append(fold_sign_flip_rate)

    averaged_weights: dict[str, float] = {}
    for model_name in model_keys:
        count = int(weight_counts.get(model_name, 0))
        if count <= 0:
            averaged_weights[model_name] = 0.0
        else:
            averaged_weights[model_name] = sanitize_number(weight_sums[model_name] / float(count))

    avg_total = sum(averaged_weights.values())
    if avg_total <= 0:
        equal_weight = 1.0 / float(len(model_keys))
        averaged_weights = {key: equal_weight for key in model_keys}
    else:
        averaged_weights = {key: value / avg_total for key, value in averaged_weights.items()}

    for key, floor in min_floors.items():
        averaged_weights[key] = max(float(floor), float(averaged_weights.get(key, 0.0)))

    floored_total = sum(averaged_weights.values())
    if floored_total <= 0:
        equal_weight = 1.0 / float(len(model_keys))
        final_weights = {key: equal_weight for key in model_keys}
    else:
        final_weights = {key: value / floored_total for key, value in averaged_weights.items()}

    evaluated_origins = len(origin_rmse_values)
    walk_forward_summary = {
        "origins": int(evaluated_origins),
        "rmse_mean": sanitize_number(float(np.mean(origin_rmse_values))) if origin_rmse_values else 0.0,
        "monotonic_rate": sanitize_number(float(np.mean(origin_monotonic_flags))) if origin_monotonic_flags else 0.0,
        "diff_vol_ratio_mean": sanitize_number(float(np.mean(origin_diff_vol_ratios))) if origin_diff_vol_ratios else 0.0,
        "sign_flip_rate_mean": sanitize_number(float(np.mean(origin_sign_flip_rates))) if origin_sign_flip_rates else 0.0,
        "origin_step": int(origin_step),
        "horizon": int(horizon),
        "lstm_origins": int(lstm_used),
        "lstm_epochs": int(lstm_epochs),
    }

    return final_weights, walk_forward_summary


def align_forecast_to_last_value(forecast: np.ndarray, last_value: float, half_life: float = 6.0) -> np.ndarray:
    if len(forecast) == 0:
        return forecast

    offset = float(last_value) - float(forecast[0])
    if abs(offset) <= 1e-8:
        return forecast

    steps = np.arange(len(forecast), dtype=float)
    decay = np.exp(-steps / max(1.0, half_life))
    return forecast + offset * decay


def shape_forecast_with_recent_volatility(
    forecast: np.ndarray,
    history: np.ndarray,
    strength: float = 0.45,
) -> np.ndarray:
    if len(forecast) <= 2 or len(history) <= 8:
        return forecast

    history_window = history[-30:] if len(history) > 30 else history
    returns = np.diff(history_window)
    if len(returns) < 3:
        return forecast

    centered = returns - np.mean(returns)
    centered_std = float(np.std(centered))
    returns_std = float(np.std(returns))
    if centered_std <= 1e-8 or returns_std <= 1e-8:
        return forecast

    normalized_pattern = centered / centered_std
    target_std = returns_std * strength

    base_diffs = np.diff(forecast)
    if len(base_diffs) == 0:
        return forecast

    base_mean = float(np.mean(base_diffs))
    shaped_diffs: list[float] = []
    for i, diff in enumerate(base_diffs):
        pattern_step = float(normalized_pattern[i % len(normalized_pattern)]) * target_std
        blended_step = float(diff) * 0.6 + (base_mean + pattern_step) * 0.4
        shaped_diffs.append(blended_step)

    shaped = np.empty_like(forecast)
    shaped[0] = forecast[0]
    for i, step in enumerate(shaped_diffs, start=1):
        shaped[i] = shaped[i - 1] + step

    return forecast * 0.65 + shaped * 0.35


def sanitize_future_path(path: np.ndarray, horizon: int, fallback: float) -> np.ndarray:
    if horizon <= 0:
        return np.empty(0, dtype=float)

    arr = np.array(path, dtype=float).reshape(-1)
    if len(arr) < horizon:
        fill_value = float(arr[-1]) if len(arr) > 0 and math.isfinite(float(arr[-1])) else float(fallback)
        arr = np.concatenate([arr, np.full(horizon - len(arr), fill_value, dtype=float)])
    elif len(arr) > horizon:
        arr = arr[:horizon]

    clean = np.empty(horizon, dtype=float)
    last_value = float(fallback)
    for i in range(horizon):
        value = float(arr[i])
        if not math.isfinite(value):
            value = last_value
        else:
            last_value = value
        clean[i] = value

    return clean


def robust_history_diff_sigma(history: np.ndarray, window_min: int = 30, window_max: int = 60) -> float:
    hist = np.array(history, dtype=float).reshape(-1)
    if len(hist) <= 2:
        return 0.0

    window = max(window_min, min(window_max, len(hist)))
    segment = hist[-window:]
    diffs = np.diff(segment)
    finite_diffs = diffs[np.isfinite(diffs)]
    if len(finite_diffs) == 0:
        return 0.0

    median_diff = float(np.median(finite_diffs))
    mad = float(np.median(np.abs(finite_diffs - median_diff)))
    sigma = 1.4826 * mad

    if not math.isfinite(sigma) or sigma <= 1e-8:
        q75, q25 = np.percentile(finite_diffs, [75, 25])
        iqr_sigma = float((q75 - q25) / 1.349) if math.isfinite(float(q75 - q25)) else 0.0
        std_sigma = float(np.std(finite_diffs))
        mean_abs = float(np.mean(np.abs(finite_diffs)))

        for candidate in (iqr_sigma, std_sigma, mean_abs):
            if math.isfinite(candidate) and candidate > 1e-8:
                sigma = candidate
                break
        else:
            sigma = 0.0

    return sanitize_number(sigma)


def build_hybrid_future_levels(
    last_close: float,
    history: np.ndarray,
    horizon: int,
    arima_future: np.ndarray,
    lstm_future: np.ndarray,
    trend_future: np.ndarray,
    returns_future: np.ndarray,
    arima_weight: float,
    lstm_weight: float,
    trend_weight: float,
    returns_weight: float,
) -> np.ndarray:
    if horizon <= 0:
        return np.empty(0, dtype=float)

    last_close_safe = float(last_close) if math.isfinite(float(last_close)) else 0.0
    components = [
        (arima_future, float(arima_weight)),
        (lstm_future, float(lstm_weight)),
        (trend_future, float(trend_weight)),
        (returns_future, float(returns_weight)),
    ]

    blended_deltas = np.zeros(horizon, dtype=float)
    valid_weight_total = 0.0
    for future_path, weight in components:
        if not math.isfinite(weight) or weight <= 0:
            continue

        model_path = sanitize_future_path(future_path, horizon, last_close_safe)
        model_deltas = np.diff(np.concatenate(([last_close_safe], model_path)))
        blended_deltas = blended_deltas + model_deltas * weight
        valid_weight_total += weight

    if valid_weight_total <= 1e-8:
        return np.full(horizon, last_close_safe, dtype=float)

    blended_deltas = blended_deltas / valid_weight_total

    sigma_floor = max(abs(last_close_safe) * 1e-5, 1e-4)
    robust_sigma = robust_history_diff_sigma(history, window_min=30, window_max=60)
    if not math.isfinite(robust_sigma) or robust_sigma <= 1e-8:
        robust_sigma = sigma_floor
    robust_sigma = max(robust_sigma, sigma_floor)

    history_arr = np.array(history, dtype=float).reshape(-1)
    anchor_slice = history_arr[-20:] if len(history_arr) > 20 else history_arr
    finite_anchor_slice = anchor_slice[np.isfinite(anchor_slice)]
    anchor = float(np.median(finite_anchor_slice)) if len(finite_anchor_slice) > 0 else last_close_safe

    reversion_start = 0.01
    reversion_end = 0.12
    step_cap_k_start = 2.2
    step_cap_k_end = 2.8
    accel_cap_k_start = 0.9
    accel_cap_k_end = 1.25

    levels = np.empty(horizon, dtype=float)
    current_level = last_close_safe
    prev_delta = 0.0

    for i in range(horizon):
        progress = float(i + 1) / float(max(1, horizon))

        step_cap_k = step_cap_k_start + (step_cap_k_end - step_cap_k_start) * progress
        step_cap = max(robust_sigma * step_cap_k, sigma_floor)

        accel_cap_k = accel_cap_k_start + (accel_cap_k_end - accel_cap_k_start) * progress
        accel_cap = max(robust_sigma * accel_cap_k, sigma_floor)

        delta = float(blended_deltas[i]) if math.isfinite(float(blended_deltas[i])) else 0.0
        delta = max(-step_cap, min(step_cap, delta))

        if i > 0:
            delta = max(prev_delta - accel_cap, min(prev_delta + accel_cap, delta))

        trial_level = current_level + delta
        reversion_strength = reversion_start + (reversion_end - reversion_start) * progress
        reverted_level = trial_level + (anchor - trial_level) * reversion_strength
        delta = reverted_level - current_level

        delta = max(-step_cap, min(step_cap, delta))
        if i > 0:
            delta = max(prev_delta - accel_cap, min(prev_delta + accel_cap, delta))

        next_level = current_level + delta
        if not math.isfinite(next_level):
            next_level = current_level
            delta = 0.0

        levels[i] = next_level
        current_level = next_level
        prev_delta = delta

    return levels


def analyze(payload: dict[str, Any]) -> dict[str, Any]:
    closes = to_float_list(payload.get("close", []))
    dates = payload.get("dates", [])
    params = payload.get("params", {})

    if len(closes) < 120:
        raise ValueError("Недостаточно данных для обучения моделей")

    look_back = int(params.get("look_back", 60) or 60)
    units = params.get("lstm_units", [50, 50])
    units1 = int(units[0] if isinstance(units, list) and len(units) > 0 else 50)
    units2 = int(units[1] if isinstance(units, list) and len(units) > 1 else units1)
    epochs = int(params.get("epochs", 20) or 20)
    batch_size = int(params.get("batch_size", 32) or 32)
    future_days = int(payload.get("days", 30) or 30)
    include_forecast = bool(payload.get("include_forecast", True))
    forecast_horizon = future_days if include_forecast else 0
    forecast_block = int(params.get("forecast_block", 5) or 5)
    forecast_block = max(1, min(forecast_block, 5))

    values = np.array(closes, dtype=float)
    train_size = int(len(values) * 0.8)
    train = values[:train_size]
    test = values[train_size:]
    max_look_back = max(20, min(60, len(train) // 4))
    look_back = max(10, min(look_back, max_look_back))

    arima_test, arima_future, arima_time = run_arima(train, test, forecast_horizon, forecast_block)
    lstm_test, lstm_future, lstm_time = run_lstm(
        train,
        test,
        values,
        look_back,
        units1,
        units2,
        epochs,
        batch_size,
        forecast_horizon,
        forecast_block,
    )
    trend_test, trend_future, trend_time = run_trend_baseline(train, test, forecast_horizon, forecast_block)
    returns_test, returns_future, returns_time = run_returns_baseline(train, test, forecast_horizon, forecast_block)

    min_len = min(len(test), len(arima_test), len(lstm_test), len(trend_test), len(returns_test))
    if min_len <= 0:
        raise ValueError("Недостаточно тестовых данных для оценки качества")

    y_true = test[:min_len]
    arima_pred = arima_test[:min_len]
    lstm_pred = lstm_test[:min_len]
    trend_pred = trend_test[:min_len]
    returns_pred = returns_test[:min_len]

    weight_window = max(10, min(30, min_len))
    min_floors = {
        "arima": 0.1,
        "lstm": 0.1,
        "trend": 0.2,
        "returns": 0.2,
    }
    weights, walk_forward_summary = walk_forward_weight_selection(
        values=values,
        future_days=future_days,
        forecast_block=forecast_block,
        look_back=look_back,
        units1=units1,
        units2=units2,
        epochs=epochs,
        batch_size=batch_size,
        min_floors=min_floors,
    )

    arima_weight = weights.get("arima", 0.25)
    lstm_weight = weights.get("lstm", 0.25)
    trend_weight = weights.get("trend", 0.25)
    returns_weight = weights.get("returns", 0.25)

    hybrid_pred = (
        arima_pred * arima_weight
        + lstm_pred * lstm_weight
        + trend_pred * trend_weight
        + returns_pred * returns_weight
    )

    arima_metrics = evaluate_model("ARIMA", y_true, arima_pred, arima_time)
    lstm_metrics = evaluate_model("LSTM", y_true, lstm_pred, lstm_time)
    hybrid_metrics = evaluate_model(
        "Гибридная",
        y_true,
        hybrid_pred,
        arima_time + lstm_time + trend_time + returns_time,
    )
    metrics = [arima_metrics, lstm_metrics, hybrid_metrics]
    best_model = min(metrics, key=lambda row: row["RMSE"])["Model"]

    test_dates = dates[train_size : train_size + min_len]
    predictions = {
        "dates": test_dates,
        "actual": [sanitize_number(v) for v in y_true.tolist()],
        "arima": [sanitize_number(v) for v in arima_pred.tolist()],
        "lstm": [sanitize_number(v) for v in lstm_pred.tolist()],
        "hybrid": [sanitize_number(v) for v in hybrid_pred.tolist()],
    }

    history_window = max(20, min(60, len(values)))

    forecast = None
    future_realism_metrics = {
        "monotonic_flag": 0.0,
        "monotonic_run_max": 0.0,
        "diff_vol_ratio": 0.0,
        "sign_flip_rate": 0.0,
    }
    if include_forecast and future_days > 0:
        future_dates = payload.get("future_dates") or []
        if len(future_dates) != future_days:
            future_dates = [f"D+{i + 1}" for i in range(future_days)]

        last_close = float(values[-1]) if len(values) else 0.0
        hybrid_future_levels = build_hybrid_future_levels(
            last_close=last_close,
            history=values,
            horizon=future_days,
            arima_future=arima_future,
            lstm_future=lstm_future,
            trend_future=trend_future,
            returns_future=returns_future,
            arima_weight=arima_weight,
            lstm_weight=lstm_weight,
            trend_weight=trend_weight,
            returns_weight=returns_weight,
        )

        residual_std = float(np.std(y_true - hybrid_pred)) if len(y_true) else 1.0
        if not math.isfinite(residual_std) or residual_std <= 1e-8:
            residual_std = 1.0
        lower, upper = moving_confidence_bounds(hybrid_future_levels, residual_std)

        forecast = {
            "dates": future_dates,
            "hybrid": [sanitize_number(v) for v in hybrid_future_levels.tolist()],
            "arima": [sanitize_number(v) for v in arima_future.tolist()],
            "conf_int_lower": [sanitize_number(v) for v in lower],
            "conf_int_upper": [sanitize_number(v) for v in upper],
        }

        future_realism_metrics = {
            "monotonic_flag": sanitize_number(monotonic_flag(hybrid_future_levels)),
            "monotonic_run_max": sanitize_number(monotonic_run_max(hybrid_future_levels)),
            "diff_vol_ratio": sanitize_number(diff_vol_ratio(hybrid_future_levels, values, history_window=history_window)),
            "sign_flip_rate": sanitize_number(sign_flip_rate(hybrid_future_levels)),
        }

    realism_metrics = {
        "future_hybrid": future_realism_metrics,
        "test_hybrid": {
            "monotonic_flag": sanitize_number(monotonic_flag(hybrid_pred)),
            "monotonic_run_max": sanitize_number(monotonic_run_max(hybrid_pred)),
            "diff_vol_ratio": sanitize_number(diff_vol_ratio(hybrid_pred, y_true, history_window=weight_window)),
            "sign_flip_rate": sanitize_number(sign_flip_rate(hybrid_pred)),
        },
        "thresholds": {
            "history_window": int(history_window),
            "diff_eps": 1e-8,
            "near_zero_std": 1e-8,
        },
    }

    return {
        "success": True,
        "data_info": {
            "total_records": int(len(values)),
            "train_records": int(train_size),
            "test_records": int(len(values) - train_size),
        },
        "comparison_table": metrics,
        "best_model": best_model,
        "predictions": predictions,
        "stationarity": stationarity_report(values),
        "forecast": forecast,
        "realism_metrics": realism_metrics,
        "walk_forward": walk_forward_summary,
        "hybrid_weights": {
            "arima": sanitize_number(arima_weight),
            "lstm": sanitize_number(lstm_weight),
            "trend": sanitize_number(trend_weight),
            "returns": sanitize_number(returns_weight),
        },
    }


def main():
    random.seed(42)
    np.random.seed(42)
    tf.random.set_seed(42)

    raw = sys.stdin.read().strip()
    if not raw:
        raise ValueError("Пустой запрос")

    payload = json.loads(raw)
    action = payload.get("action")

    if action in ("analyze", "forecast"):
        result = analyze(payload)
        if action == "forecast":
            result = {"success": True, "forecast": result["forecast"]}
        print(json.dumps(result, ensure_ascii=False))
        return

    raise ValueError(f"Неизвестное действие: {action}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"success": False, "error": str(exc)}, ensure_ascii=False))
        sys.exit(1)
