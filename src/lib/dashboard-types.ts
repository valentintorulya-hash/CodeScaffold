import { DataInfo, ModelMetrics, Predictions, StationarityResult, FutureForecastResult } from '@/lib/ml-api';
import { ChartWindow } from '@/lib/chart-utils';

export type PanChartKey = 'forecast' | 'analysis' | 'future';

export interface PricePoint {
  date: string;
  close: number;
  avg_price: number;
}

export interface DashboardState {
  dataInfo: DataInfo | null;
  priceData: PricePoint[];
  predictions: Predictions | null;
  metrics: ModelMetrics[];
  bestModel: string;
  stationarity: StationarityResult | null;
  futureForecast: FutureForecastResult | null;
  forecastWindow: ChartWindow | null;
  analysisWindow: ChartWindow | null;
  futureWindow: ChartWindow | null;
}
