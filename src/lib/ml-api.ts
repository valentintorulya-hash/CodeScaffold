const ML_API_ENDPOINT = '/api/ml';

export interface DataInfo {
  total_records: number;
  train_records: number;
  test_records: number;
}

export interface ModelMetrics {
  Model: string;
  MAE: number;
  RMSE: number;
  MAPE: number;
  R2: number;
  'Время (сек)'?: number;
}

export interface Predictions {
  dates: string[];
  actual: number[];
  arima: (number | null)[];
  lstm: (number | null)[];
  hybrid: (number | null)[];
}

export interface StationarityResult {
  adf: { test_statistic: number; p_value: number; is_stationary: boolean; interpretation: string };
  kpss: { test_statistic: number; p_value: number; is_stationary: boolean };
  stationarity_type: string;
}

export interface FutureForecastResult {
  dates: string[];
  hybrid: number[];
  arima: number[];
  conf_int_lower: number[];
  conf_int_upper: number[];
}

type AnalysisParams = {
  start_date?: string;
  end_date?: string;
  look_back?: number;
  lstm_units?: number[];
  epochs?: number;
  batch_size?: number;
};

async function callMlApi<T>(action: string, params?: Record<string, unknown>): Promise<T> {
  const response = await fetch(ML_API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, params }),
    cache: 'no-store',
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Некорректный ответ ML API');
  }

  const safePayload = payload as { success?: boolean; error?: string };
  if (!response.ok || safePayload.success === false) {
    throw new Error(safePayload.error || `ML API request failed (${response.status})`);
  }

  return payload as T;
}

export async function healthCheck(): Promise<boolean> {
  await callMlApi<{ success: true; status: string }>('healthCheck');
  return true;
}

export async function runFullAnalysis(params: AnalysisParams): Promise<{
  success: boolean;
  data_info: DataInfo;
  comparison_table: ModelMetrics[];
  best_model: string;
  // Consolidated analysis fields.
  // Forecast is now optional and can be computed on-demand.
  predictions: Predictions;
  stationarity: StationarityResult;
  forecast: FutureForecastResult | null;
  dates: string[];
  close: number[];
  avg_price: number[];
  error?: string;
}> {
  return callMlApi('runFullAnalysis', params);
}

export async function forecastFuture(params: { days: number; recalculate?: boolean }): Promise<{
  success: boolean;
  forecast: FutureForecastResult;
}> {
  return callMlApi('forecastFuture', params);
}
