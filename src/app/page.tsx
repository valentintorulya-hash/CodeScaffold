'use client';

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { BeamsBackground } from '@/components/ui/beams-background';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar, ComposedChart, ReferenceLine, Brush
} from 'recharts';
import { 
  Activity, TrendingUp, TrendingDown, BarChart3, Brain, Settings, 
  Play, RefreshCw, AlertCircle, CheckCircle2, Clock, Zap
} from 'lucide-react';
import {
  runFullAnalysis,
  forecastFuture,
  healthCheck,
  type DataInfo,
  type ModelMetrics,
  type Predictions,
  type StationarityResult,
  type FutureForecastResult,
} from '@/lib/ml-api';

// Цветовая палитра для графиков
const COLORS = {
  actual: '#cbd5e1',
  arima: '#60a5fa',
  lstm: '#22d3ee',
  hybrid: '#f59e0b',
  forecast: '#fbbf24',
  confidence: 'rgba(245, 158, 11, 0.22)',
};

const CHART_GRID = 'rgba(148, 163, 184, 0.2)';

const TOOLTIP_STYLE = {
  backgroundColor: 'rgba(15, 23, 42, 0.92)',
  border: '1px solid rgba(148, 163, 184, 0.35)',
  borderRadius: '10px',
  color: '#e2e8f0',
  backdropFilter: 'blur(8px)',
};

const CHART_TICK = { fontSize: 10, fill: '#cbd5e1' };
const CHART_TICK_SMALL = { fontSize: 8, fill: '#cbd5e1' };
const CHART_AXIS = '#64748b';
const LEGEND_STYLE = { color: '#e2e8f0' };
const chartDomainWithPadding = ([dataMin, dataMax]: [number, number]): [number, number] => {
  const safeMin = Number.isFinite(dataMin) ? dataMin : 0;
  const safeMax = Number.isFinite(dataMax) ? dataMax : safeMin + 1;

  if (safeMin === safeMax) {
    const pad = Math.max(Math.abs(safeMin) * 0.02, 1);
    return [safeMin - pad, safeMax + pad];
  }

  return [Math.floor(safeMin * 0.98), Math.ceil(safeMax * 1.02)];
};

const legendFormatter = (value: string) => (
  <span style={{ color: '#e2e8f0' }}>{value}</span>
);

const ANALYSIS_SNAPSHOT_KEY = 'dashboard-analysis-snapshot:v1';

interface PricePoint {
  date: string;
  close: number;
  avg_price: number;
}

interface ChartWindow {
  startIndex: number;
  endIndex: number;
}

type PanChartKey = 'forecast' | 'analysis' | 'future';

const DEFAULT_CHART_WINDOW = 90;
const PAN_SENSITIVITY = 1.2;

const createInitialWindow = (dataLength: number): ChartWindow | null => {
  if (dataLength <= 0) return null;
  const visiblePoints = Math.min(DEFAULT_CHART_WINDOW, dataLength);
  return {
    startIndex: dataLength - visiblePoints,
    endIndex: dataLength - 1,
  };
};

const normalizeWindow = (window: ChartWindow, dataLength: number): ChartWindow | null => {
  if (dataLength <= 0) return null;

  const start = Math.max(0, Math.min(window.startIndex, dataLength - 1));
  const end = Math.max(start, Math.min(window.endIndex, dataLength - 1));

  return { startIndex: start, endIndex: end };
};

interface PersistedAnalysisSnapshot {
  version: 1;
  dataInfo: DataInfo | null;
  priceData: PricePoint[];
  predictions: Predictions | null;
  metrics: ModelMetrics[];
  bestModel: string;
  stationarity: StationarityResult | null;
  futureForecast: FutureForecastResult | null;
  progress: number;
  status: string;
}

export default function Dashboard() {
  // Состояние данных
  const [isLoading, setIsLoading] = useState(false);
  const [isForecastLoading, setIsForecastLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [serviceStatus, setServiceStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [isSnapshotReady, setIsSnapshotReady] = useState(false);

  // Данные
  const [dataInfo, setDataInfo] = useState<DataInfo | null>(null);
  const [priceData, setPriceData] = useState<PricePoint[]>([]);
  const [predictions, setPredictions] = useState<Predictions | null>(null);
  const [metrics, setMetrics] = useState<ModelMetrics[]>([]);
  const [bestModel, setBestModel] = useState<string>('');
  const [stationarity, setStationarity] = useState<StationarityResult | null>(null);
  const [futureForecast, setFutureForecast] = useState<FutureForecastResult | null>(null);
  const [forecastWindow, setForecastWindow] = useState<ChartWindow | null>(null);
  const [analysisWindow, setAnalysisWindow] = useState<ChartWindow | null>(null);
  const [futureWindow, setFutureWindow] = useState<ChartWindow | null>(null);

  const chartWindowsRef = useRef<Record<PanChartKey, ChartWindow | null>>({
    forecast: null,
    analysis: null,
    future: null,
  });

  const panStateRef = useRef<{
    chartKey: PanChartKey;
    currentX: number;
    lastX: number;
    chartWidth: number;
    dataLength: number;
    window: ChartWindow;
    frameId: number | null;
    fractionalShift: number;
  } | null>(null);

  // Параметры модели
  const [params, setParams] = useState({
    startDate: '2021-01-01',
    endDate: '',
    lookBack: 60,
    lstmUnits1: 50,
    lstmUnits2: 50,
    epochs: 50,
    batchSize: 32,
  });

  useEffect(() => {
    try {
      const rawSnapshot = window.localStorage.getItem(ANALYSIS_SNAPSHOT_KEY);
      if (!rawSnapshot) return;

      const snapshot = JSON.parse(rawSnapshot) as PersistedAnalysisSnapshot;
      if (snapshot.version !== 1) {
        window.localStorage.removeItem(ANALYSIS_SNAPSHOT_KEY);
        return;
      }

      setDataInfo(snapshot.dataInfo);
      setPriceData(snapshot.priceData);
      setPredictions(snapshot.predictions);
      setMetrics(snapshot.metrics);
      setBestModel(snapshot.bestModel);
      setStationarity(snapshot.stationarity);
      setFutureForecast(snapshot.futureForecast);
      setProgress(snapshot.progress);
      setStatus(snapshot.status);
    } catch {
      window.localStorage.removeItem(ANALYSIS_SNAPSHOT_KEY);
    } finally {
      setIsSnapshotReady(true);
    }
  }, []);

  useEffect(() => {
    if (!isSnapshotReady || isLoading) return;

    const hasAnalysisData = Boolean(
      dataInfo ||
      predictions ||
      metrics.length > 0 ||
      priceData.length > 0 ||
      stationarity ||
      futureForecast
    );

    if (!hasAnalysisData) return;

    // Debounce localStorage writes — coalesce rapid state updates into one write
    const timeoutId = setTimeout(() => {
      const snapshot: PersistedAnalysisSnapshot = {
        version: 1,
        dataInfo,
        priceData,
        predictions,
        metrics,
        bestModel,
        stationarity,
        futureForecast,
        progress,
        status,
      };

      window.localStorage.setItem(ANALYSIS_SNAPSHOT_KEY, JSON.stringify(snapshot));
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [
    bestModel,
    dataInfo,
    futureForecast,
    isLoading,
    isSnapshotReady,
    metrics,
    predictions,
    priceData,
    progress,
    stationarity,
    status,
  ]);

  // Проверка статуса сервиса
  useEffect(() => {
    const checkHealth = async () => {
      try {
        await healthCheck();
        setServiceStatus('online');
      } catch {
        setServiceStatus('offline');
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  // Запуск полного анализа
  const handleRunAnalysis = useCallback(async () => {
    setIsLoading(true);
    setIsForecastLoading(false);
    setProgress(0);
    setError(null);
    setDataInfo(null);
    setPriceData([]);
    setPredictions(null);
    setMetrics([]);
    setBestModel('');
    setStationarity(null);
    setFutureForecast(null);
    setForecastWindow(null);
    setAnalysisWindow(null);
    setFutureWindow(null);
    window.localStorage.removeItem(ANALYSIS_SNAPSHOT_KEY);

    try {
      setStatus('Загрузка данных...');
      setProgress(10);

      const result = await runFullAnalysis({
        start_date: params.startDate || undefined,
        end_date: params.endDate || undefined,
        look_back: params.lookBack,
        lstm_units: [params.lstmUnits1, params.lstmUnits2],
        epochs: params.epochs,
        batch_size: params.batchSize,
      });

      setProgress(80);
      setStatus('Обработка результатов...');

      if (result.success) {
        setDataInfo(result.data_info);
        setMetrics(result.comparison_table);
        setBestModel(result.best_model);

        // Analysis data comes from the consolidated response.
        // Future forecast is requested on-demand via the "Прогноз" button.
        setPredictions(result.predictions);
        setStationarity(result.stationarity);

        // Build chart data from consolidated dates/close/avg_price
        if (result.dates && result.close) {
          const chartData = result.dates.map((date: string, i: number) => ({
            date: date.slice(0, 10),
            close: result.close[i],
            avg_price: result.avg_price?.[i] ?? result.close[i],
          }));
          setPriceData(chartData);
        }

        setProgress(100);
        setStatus('Анализ завершён! Для прогноза на будущее нажмите «Прогноз».');
      } else {
        throw new Error(result.error || 'Неизвестная ошибка');
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка при выполнении анализа');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [params]);

  // Прогноз на будущее
  const handleForecastFuture = useCallback(async () => {
    if (!predictions) return;

    setError(null);
    setIsForecastLoading(true);
    try {
      const result = await forecastFuture({ days: 30, recalculate: true });
      if (result.success) {
        setFutureForecast(result.forecast);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsForecastLoading(false);
    }
  }, [predictions]);

  const applyWindowByChart = useCallback((chartKey: PanChartKey, window: ChartWindow) => {
    chartWindowsRef.current[chartKey] = window;

    if (chartKey === 'forecast') {
      setForecastWindow(window);
      return;
    }

    if (chartKey === 'analysis') {
      setAnalysisWindow(window);
      return;
    }

    setFutureWindow(window);
  }, []);

  const handleBrushChange = useCallback(
    (chartKey: PanChartKey, dataLength: number) =>
      (range: { startIndex?: number; endIndex?: number } | null) => {
        if (!range) return;
        if (typeof range.startIndex !== 'number' || typeof range.endIndex !== 'number') return;

        const nextWindow = normalizeWindow(
          { startIndex: range.startIndex, endIndex: range.endIndex },
          dataLength
        );

        if (!nextWindow) return;
        applyWindowByChart(chartKey, nextWindow);
      },
    [applyWindowByChart]
  );

  const startChartPan = useCallback(
    (
      chartKey: PanChartKey,
      event: ReactMouseEvent<HTMLDivElement> | ReactPointerEvent<HTMLDivElement>,
      currentWindow: ChartWindow | null,
      dataLength: number
    ) => {
      const activeWindow = chartWindowsRef.current[chartKey] ?? currentWindow;
      if (!activeWindow || dataLength <= 1) return;

      const visiblePoints = activeWindow.endIndex - activeWindow.startIndex + 1;
      if (visiblePoints >= dataLength) return;

      panStateRef.current = {
        chartKey,
        currentX: event.clientX,
        lastX: event.clientX,
        chartWidth: event.currentTarget.clientWidth,
        dataLength,
        window: activeWindow,
        frameId: null,
        fractionalShift: 0,
      };
    },
    []
  );

  const stopChartPan = useCallback(() => {
    const panState = panStateRef.current;
    if (panState && panState.frameId !== null) {
      window.cancelAnimationFrame(panState.frameId);
    }

    panStateRef.current = null;
  }, []);

  const moveChartPan = useCallback(
    (event: MouseEvent) => {
      const panState = panStateRef.current;
      if (!panState) return;

      panState.currentX = event.clientX;
      if (panState.frameId !== null) return;

      panState.frameId = window.requestAnimationFrame(() => {
        const activePanState = panStateRef.current;
        if (!activePanState) return;

        activePanState.frameId = null;

        const currentWindow = chartWindowsRef.current[activePanState.chartKey] ?? activePanState.window;
        const visiblePoints = currentWindow.endIndex - currentWindow.startIndex + 1;
        const pointsPerPixel = (visiblePoints / Math.max(activePanState.chartWidth, 1)) * PAN_SENSITIVITY;
        const deltaX = activePanState.currentX - activePanState.lastX;
        const shiftFloat = deltaX * pointsPerPixel + activePanState.fractionalShift;
        const shift = shiftFloat < 0 ? Math.ceil(shiftFloat) : Math.floor(shiftFloat);

        activePanState.lastX = activePanState.currentX;
        activePanState.fractionalShift = shiftFloat - shift;

        if (shift === 0) {
          return;
        }

        const maxStart = activePanState.dataLength - visiblePoints;
        const nextStart = Math.max(0, Math.min(currentWindow.startIndex - shift, maxStart));
        const nextEnd = nextStart + visiblePoints - 1;
        const nextWindow = { startIndex: nextStart, endIndex: nextEnd };

        if (
          currentWindow &&
          currentWindow.startIndex === nextWindow.startIndex &&
          currentWindow.endIndex === nextWindow.endIndex
        ) {
          return;
        }

        activePanState.window = nextWindow;
        applyWindowByChart(activePanState.chartKey, nextWindow);
      });
    },
    [applyWindowByChart]
  );

  // Подготовка данных для графика прогнозов
  const forecastChartData = useMemo(
    () =>
      predictions
        ? predictions.dates.map((date, i) => ({
            date: date.slice(0, 10),
            actual: predictions.actual[i],
            arima: predictions.arima[i],
            lstm: predictions.lstm[i],
            hybrid: predictions.hybrid[i],
          }))
        : [],
    [predictions]
  );

  const futureContextData = useMemo(
    () =>
      priceData.slice(-10).map((point) => ({
        date: point.date.slice(0, 10),
        actual: point.close,
      })),
    [priceData]
  );

  const lastObservedDate = futureContextData[futureContextData.length - 1]?.date ?? '';
  const forecastStartDate = futureForecast?.dates[0]?.slice(0, 10) ?? '';

  // Подготовка данных для прогноза на будущее
  const futureChartData = useMemo(
    () =>
      futureForecast
        ? [
            ...futureContextData,
            ...futureForecast.dates.map((date: string, i: number) => ({
              date: date.slice(0, 10),
              hybrid: futureForecast.hybrid[i],
              isFuture: true,
            })),
          ]
        : forecastChartData,
    [forecastChartData, futureContextData, futureForecast]
  );

  const modelErrors = useMemo(() => {
    if (!predictions) return null;

    return {
      arima: predictions.dates.map((date, i) => ({
        date: date.slice(0, 10),
        error: predictions.arima[i] === null ? 0 : predictions.actual[i] - predictions.arima[i],
      })),
      lstm: predictions.dates.map((date, i) => ({
        date: date.slice(0, 10),
        error: predictions.lstm[i] === null ? 0 : predictions.actual[i] - predictions.lstm[i],
      })),
      hybrid: predictions.dates.map((date, i) => ({
        date: date.slice(0, 10),
        error: predictions.hybrid[i] === null ? 0 : predictions.actual[i] - predictions.hybrid[i],
      })),
    };
  }, [predictions]);

  useEffect(() => {
    setForecastWindow(createInitialWindow(forecastChartData.length));
  }, [forecastChartData.length]);

  useEffect(() => {
    setAnalysisWindow(createInitialWindow(priceData.length));
  }, [priceData.length]);

  useEffect(() => {
    setFutureWindow(createInitialWindow(futureChartData.length));
  }, [futureChartData.length]);

  useEffect(() => {
    chartWindowsRef.current.forecast = forecastWindow;
  }, [forecastWindow]);

  useEffect(() => {
    chartWindowsRef.current.analysis = analysisWindow;
  }, [analysisWindow]);

  useEffect(() => {
    chartWindowsRef.current.future = futureWindow;
  }, [futureWindow]);

  useEffect(() => {
    window.addEventListener('mousemove', moveChartPan);
    window.addEventListener('mouseup', stopChartPan);
    window.addEventListener('blur', stopChartPan);

    return () => {
      window.removeEventListener('mousemove', moveChartPan);
      window.removeEventListener('mouseup', stopChartPan);
      window.removeEventListener('blur', stopChartPan);
    };
  }, [moveChartPan, stopChartPan]);

  return (
    <div className="dashboard-shell relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <BeamsBackground />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.18),transparent_48%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_90%_15%,rgba(245,158,11,0.16),transparent_42%)]" />

      {/* Шапка */}
      <header className="sticky top-0 z-50 border-b border-slate-700/70 bg-slate-950/70 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 p-2.5 shadow-[0_0_32px_rgba(245,158,11,0.35)]">
                <TrendingUp className="h-6 w-6 text-slate-950" />
              </div>
              <div>
                <h1 className="font-serif text-2xl font-normal text-slate-50 md:text-3xl">
                  Гибридная модель ARIMA-LSTM
                </h1>
                <p className="text-sm text-slate-300">
                  Прогнозирование акций ПАО «Сбербанк» (SBER.ME)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Badge 
                variant={serviceStatus === 'online' ? 'default' : 'destructive'}
                className="flex items-center gap-1 border border-slate-500/70 bg-slate-900/80 text-slate-100"
              >
                {serviceStatus === 'online' ? (
                  <>
                    <CheckCircle2 className="h-3 w-3" />
                    ML-сервис онлайн
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3 w-3" />
                    ML-сервис оффлайн
                  </>
                )}
              </Badge>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-6">
        {/* Панель параметров */}
        <Card className="mb-6 border-slate-700/70 bg-slate-900/65 shadow-xl backdrop-blur-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-serif text-slate-50">
              <Settings className="h-5 w-5 text-amber-300" />
              Параметры анализа
            </CardTitle>
            <CardDescription className="text-slate-300">
              Настройте период данных и гиперпараметры моделей
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7 [&_label]:text-slate-200 [&_input]:border-slate-500/70 [&_input]:bg-slate-950/40 [&_input]:text-slate-100 [&_input]:placeholder:text-slate-400">
              <div>
                <Label htmlFor="startDate">Начальная дата</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={params.startDate}
                  onChange={(e) => setParams({ ...params, startDate: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="endDate">Конечная дата</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={params.endDate}
                  onChange={(e) => setParams({ ...params, endDate: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="lookBack">Размер окна (дней)</Label>
                <Input
                  id="lookBack"
                  type="number"
                  value={params.lookBack}
                  onChange={(e) => {
                    const nextValue = Number.parseInt(e.target.value, 10);
                    if (Number.isNaN(nextValue)) return;
                    setParams({ ...params, lookBack: nextValue });
                  }}
                />
              </div>
              <div>
                <Label htmlFor="lstmUnits1">LSTM слои</Label>
                <Input
                  id="lstmUnits1"
                  type="number"
                  value={params.lstmUnits1}
                  onChange={(e) => {
                    const nextValue = Number.parseInt(e.target.value, 10);
                    if (Number.isNaN(nextValue)) return;
                    setParams({ ...params, lstmUnits1: nextValue });
                  }}
                />
              </div>
              <div>
                <Label htmlFor="epochs">Эпохи</Label>
                <Input
                  id="epochs"
                  type="number"
                  value={params.epochs}
                  onChange={(e) => {
                    const nextValue = Number.parseInt(e.target.value, 10);
                    if (Number.isNaN(nextValue)) return;
                    setParams({ ...params, epochs: nextValue });
                  }}
                />
              </div>
              <div>
                <Label htmlFor="batchSize">Размер батча</Label>
                <Input
                  id="batchSize"
                  type="number"
                  value={params.batchSize}
                  onChange={(e) => {
                    const nextValue = Number.parseInt(e.target.value, 10);
                    if (Number.isNaN(nextValue)) return;
                    setParams({ ...params, batchSize: nextValue });
                  }}
                />
              </div>
              <div className="flex items-end">
                <Button 
                  onClick={handleRunAnalysis}
                  disabled={isLoading || serviceStatus === 'offline'}
                  className="w-full bg-amber-500 text-slate-950 hover:bg-amber-400"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Анализ...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Запустить анализ
                    </>
                  )}
                </Button>
              </div>
            </div>

            {isLoading && (
              <div className="mt-4">
                <Progress value={progress} className="h-2 bg-slate-800 [&>div]:bg-gradient-to-r [&>div]:from-amber-600 [&>div]:to-amber-400" />
                <p className="mt-2 text-sm text-slate-300">{status}</p>
              </div>
            )}

            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Ошибка</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Информация о данных */}
        {dataInfo && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card className="border-slate-700/70 bg-slate-900/60 backdrop-blur-sm">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-amber-300" />
                  <div>
                    <p className="text-sm text-slate-300">Всего записей</p>
                    <p className="text-2xl font-bold">{dataInfo.total_records}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-700/70 bg-slate-900/60 backdrop-blur-sm">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-cyan-300" />
                  <div>
                    <p className="text-sm text-slate-300">Обучающая выборка</p>
                    <p className="text-2xl font-bold">{dataInfo.train_records}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-700/70 bg-slate-900/60 backdrop-blur-sm">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-blue-300" />
                  <div>
                    <p className="text-sm text-slate-300">Тестовая выборка</p>
                    <p className="text-2xl font-bold">{dataInfo.test_records}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-700/70 bg-slate-900/60 backdrop-blur-sm">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-amber-300" />
                  <div>
                    <p className="text-sm text-slate-300">Лучшая модель</p>
                    <p className="text-lg font-bold text-amber-300">{bestModel || '—'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Табы с результатами */}
        <Tabs defaultValue="forecast" className="space-y-4">
          <TabsList className="h-auto w-full grid grid-cols-2 gap-1 overflow-visible border border-slate-700/70 bg-slate-900/65 p-1 backdrop-blur-md md:grid-cols-4">
            <TabsTrigger value="forecast" className="min-h-9 h-auto whitespace-normal px-2 py-2 text-xs text-slate-200 leading-tight data-[state=active]:bg-amber-500 data-[state=active]:text-slate-950 md:text-sm">Прогнозы</TabsTrigger>
            <TabsTrigger value="comparison" className="min-h-9 h-auto whitespace-normal px-2 py-2 text-xs text-slate-200 leading-tight data-[state=active]:bg-amber-500 data-[state=active]:text-slate-950 md:text-sm">Сравнение моделей</TabsTrigger>
            <TabsTrigger value="analysis" className="min-h-9 h-auto whitespace-normal px-2 py-2 text-xs text-slate-200 leading-tight data-[state=active]:bg-amber-500 data-[state=active]:text-slate-950 md:text-sm">Анализ данных</TabsTrigger>
            <TabsTrigger value="future" className="min-h-9 h-auto whitespace-normal px-2 py-2 text-xs text-slate-200 leading-tight data-[state=active]:bg-amber-500 data-[state=active]:text-slate-950 md:text-sm">Прогноз на будущее</TabsTrigger>
          </TabsList>

          {/* Таб: Прогнозы */}
          <TabsContent value="forecast" className="space-y-4">
            <Card className="border-slate-700/70 bg-slate-900/65 backdrop-blur-md">
              <CardHeader>
                <CardTitle className="font-serif text-slate-50">Сравнение прогнозов моделей</CardTitle>
                <CardDescription className="text-slate-300">
                  Фактические значения на тестовом периоде vs прогнозы ARIMA, LSTM и гибридной модели
                </CardDescription>
              </CardHeader>
              <CardContent>
                {forecastChartData.length > 0 ? (
                  <div
                    className="h-[400px] cursor-grab select-none active:cursor-grabbing"
                    role="application"
                    onPointerDown={(event) =>
                      startChartPan('forecast', event, forecastWindow, forecastChartData.length)
                    }
                    onMouseLeave={stopChartPan}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={forecastChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                        <XAxis 
                          dataKey="date" 
                          tick={CHART_TICK}
                          stroke={CHART_AXIS}
                          angle={-45}
                          textAnchor="end"
                          height={80}
                        />
                        <YAxis tick={CHART_TICK} stroke={CHART_AXIS} domain={chartDomainWithPadding} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} isAnimationActive={false} />
                        <Legend wrapperStyle={LEGEND_STYLE} formatter={legendFormatter} />
                        <Line 
                          type="monotone" 
                          dataKey="actual" 
                          stroke={COLORS.actual} 
                          strokeWidth={2}
                          isAnimationActive={false}
                          dot={false}
                          name="Фактические (тест)"
                        />
                        <Line 
                          type="monotone" 
                          dataKey="arima" 
                          stroke={COLORS.arima} 
                          strokeWidth={1.5}
                          strokeDasharray="5 5"
                          isAnimationActive={false}
                          dot={false}
                          name="ARIMA"
                        />
                        <Line 
                          type="monotone" 
                          dataKey="lstm" 
                          stroke={COLORS.lstm} 
                          strokeWidth={1.5}
                          strokeDasharray="3 3"
                          isAnimationActive={false}
                          dot={false}
                          name="LSTM"
                        />
                        <Line 
                          type="monotone" 
                          dataKey="hybrid" 
                          stroke={COLORS.hybrid} 
                          strokeWidth={2}
                          isAnimationActive={false}
                          dot={false}
                          name="Гибридная"
                        />
                        <Brush
                          dataKey="date"
                          height={24}
                          stroke={COLORS.hybrid}
                          travellerWidth={8}
                          startIndex={forecastWindow?.startIndex}
                          endIndex={forecastWindow?.endIndex}
                          onChange={handleBrushChange('forecast', forecastChartData.length)}
                          tickFormatter={() => ''}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[400px] flex items-center justify-center text-slate-400">
                    Запустите анализ для получения прогнозов
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Ошибки моделей */}
            {predictions && (
              <div className="grid md:grid-cols-3 gap-4">
                {(['arima', 'lstm', 'hybrid'] as const).map((model) => {
                  const errors = modelErrors?.[model] ?? [];
                  const modelNames: Record<string, string> = {
                    arima: 'ARIMA',
                    lstm: 'LSTM',
                    hybrid: 'Гибридная'
                  };
                  
                  return (
                    <Card key={model} className="border-slate-700/70 bg-slate-900/65 backdrop-blur-md">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-slate-50">
                          Ошибки: {modelNames[model]}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={150}>
                          <BarChart data={errors}>
                            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                            <XAxis dataKey="date" tick={false} stroke={CHART_AXIS} />
                            <YAxis tick={CHART_TICK_SMALL} stroke={CHART_AXIS} domain={chartDomainWithPadding} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Bar 
                              dataKey="error" 
                              fill={model === 'hybrid' ? COLORS.hybrid : model === 'arima' ? COLORS.arima : COLORS.lstm}
                              opacity={0.7}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Таб: Сравнение моделей */}
          <TabsContent value="comparison" className="space-y-4">
            {metrics.length > 0 ? (
              <>
                {/* Таблица метрик */}
                <Card className="border-slate-700/70 bg-slate-900/65 backdrop-blur-md">
                  <CardHeader>
                    <CardTitle className="font-serif text-slate-50">Метрики качества моделей</CardTitle>
                    <CardDescription className="text-slate-300">
                      Сравнение по MAE, RMSE, MAPE и R²
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-slate-100">
                        <thead>
                          <tr className="border-b border-slate-700/70">
                            <th className="py-3 px-4 text-left text-slate-200">Модель</th>
                            <th className="py-3 px-4 text-right text-slate-200">MAE ↓</th>
                            <th className="py-3 px-4 text-right text-slate-200">RMSE ↓</th>
                            <th className="py-3 px-4 text-right text-slate-200">MAPE (%) ↓</th>
                            <th className="py-3 px-4 text-right text-slate-200">R² ↑</th>
                            <th className="py-3 px-4 text-right text-slate-200">Время (сек)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {metrics.map((m) => (
                            <tr 
                              key={m.Model} 
                              className={`border-b border-slate-700/70 ${m.Model === bestModel ? 'bg-amber-500/20' : ''}`}
                            >
                              <td className="py-3 px-4 font-medium text-slate-100">
                                {m.Model}
                                {m.Model === bestModel && (
                                  <Badge className="ml-2 bg-amber-500 text-slate-950">Лучшая</Badge>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right text-slate-100">{m.MAE.toFixed(2)}</td>
                              <td className="py-3 px-4 text-right text-slate-100">{m.RMSE.toFixed(2)}</td>
                              <td className="py-3 px-4 text-right text-slate-100">{m.MAPE.toFixed(2)}</td>
                              <td className="py-3 px-4 text-right text-slate-100">{m.R2.toFixed(4)}</td>
                              <td className="py-3 px-4 text-right text-slate-100">{m['Время (сек)']?.toFixed(1) || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* Графики метрик */}
                <div className="grid md:grid-cols-2 gap-4">
                  <Card className="border-slate-700/70 bg-slate-900/65 backdrop-blur-md">
                    <CardHeader>
                      <CardTitle className="text-sm text-slate-50">MAE и RMSE</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={metrics} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                          <XAxis type="number" tick={CHART_TICK_SMALL} stroke={CHART_AXIS} />
                          <YAxis dataKey="Model" type="category" width={100} tick={CHART_TICK_SMALL} stroke={CHART_AXIS} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} />
                          <Legend wrapperStyle={LEGEND_STYLE} formatter={legendFormatter} />
                          <Bar dataKey="MAE" fill={COLORS.arima} name="MAE" />
                          <Bar dataKey="RMSE" fill={COLORS.hybrid} name="RMSE" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card className="border-slate-700/70 bg-slate-900/65 backdrop-blur-md">
                    <CardHeader>
                      <CardTitle className="text-sm text-slate-50">MAPE (%)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={metrics}>
                          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                          <XAxis dataKey="Model" tick={CHART_TICK_SMALL} stroke={CHART_AXIS} />
                          <YAxis tick={CHART_TICK_SMALL} stroke={CHART_AXIS} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} />
                          <Bar dataKey="MAPE" fill={COLORS.lstm} name="MAPE (%)" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              </>
            ) : (
              <Card className="border-slate-700/70 bg-slate-900/65 backdrop-blur-md">
                <CardContent className="py-12 text-center text-slate-400">
                  Запустите анализ для сравнения моделей
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Таб: Анализ данных */}
          <TabsContent value="analysis" className="space-y-4">
            {/* Исходные данные */}
            <Card className="border-slate-700/70 bg-slate-900/65 backdrop-blur-md">
              <CardHeader>
                <CardTitle className="font-serif text-slate-50">Исторические данные акций SBER.ME</CardTitle>
                <CardDescription className="text-slate-300">
                  Цена акций Сбербанка на Московской бирже
                </CardDescription>
              </CardHeader>
              <CardContent>
                {priceData.length > 0 ? (
                  <div
                    className="h-[350px] cursor-grab select-none active:cursor-grabbing"
                    role="application"
                    onPointerDown={(event) =>
                      startChartPan('analysis', event, analysisWindow, priceData.length)
                    }
                    onMouseLeave={stopChartPan}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={priceData}>
                        <defs>
                          <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={COLORS.hybrid} stopOpacity={0.3}/>
                            <stop offset="95%" stopColor={COLORS.hybrid} stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                        <XAxis 
                          dataKey="date" 
                          tick={CHART_TICK}
                          stroke={CHART_AXIS}
                          angle={-45}
                          textAnchor="end"
                          height={80}
                        />
                        <YAxis tick={CHART_TICK} stroke={CHART_AXIS} domain={chartDomainWithPadding} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} isAnimationActive={false} />
                        <Area 
                          type="monotone" 
                          dataKey="close" 
                          stroke={COLORS.hybrid} 
                          fillOpacity={1} 
                          isAnimationActive={false}
                          fill="url(#colorPrice)"
                          name="Цена закрытия"
                        />
                        <Brush
                          dataKey="date"
                          height={24}
                          stroke={COLORS.hybrid}
                          travellerWidth={8}
                          startIndex={analysisWindow?.startIndex}
                          endIndex={analysisWindow?.endIndex}
                          onChange={handleBrushChange('analysis', priceData.length)}
                          tickFormatter={() => ''}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[350px] flex items-center justify-center text-slate-400">
                    Запустите анализ для загрузки данных
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Стационарность */}
            {stationarity && (
              <Card className="border-slate-700/70 bg-slate-900/65 backdrop-blur-md">
                <CardHeader>
                  <CardTitle className="font-serif text-slate-50">Анализ стационарности</CardTitle>
                  <CardDescription className="text-slate-300">
                    Тесты Дики-Фуллера (ADF) и KPSS
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-6 text-slate-100 md:grid-cols-2">
                    <div>
                      <h4 className="mb-2 font-medium text-slate-100">ADF тест</h4>
                      <div className="space-y-2 text-sm text-slate-100">
                        <div className="flex justify-between">
                          <span className="text-slate-300">Статистика:</span>
                          <span className="font-mono text-slate-100">{stationarity.adf.test_statistic.toFixed(4)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-300">p-value:</span>
                          <span className="font-mono text-slate-100">{stationarity.adf.p_value.toFixed(4)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-300">Результат:</span>
                          <Badge variant={stationarity.adf.is_stationary ? 'default' : 'destructive'}>
                            {stationarity.adf.interpretation}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h4 className="mb-2 font-medium text-slate-100">KPSS тест</h4>
                      <div className="space-y-2 text-sm text-slate-100">
                        <div className="flex justify-between">
                          <span className="text-slate-300">Статистика:</span>
                          <span className="font-mono text-slate-100">{stationarity.kpss.test_statistic.toFixed(4)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-300">p-value:</span>
                          <span className="font-mono text-slate-100">{stationarity.kpss.p_value.toFixed(4)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-300">Результат:</span>
                          <Badge variant={stationarity.kpss.is_stationary ? 'default' : 'destructive'}>
                            {stationarity.kpss.is_stationary ? 'Стационарен' : 'Нестационарен'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                  <Separator className="my-4" />
                  <div className="text-sm text-slate-100">
                    <span className="font-medium text-slate-100">Итог: </span>
                    {stationarity.stationarity_type}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Таб: Прогноз на будущее */}
          <TabsContent value="future" className="space-y-4">
            <Card className="border-slate-700/70 bg-slate-900/65 backdrop-blur-md">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="font-serif text-slate-50">Прогноз на 30 дней</CardTitle>
                    <CardDescription className="text-slate-300">
                      Предсказание будущих цен акций
                    </CardDescription>
                  </div>
                  <Button 
                    onClick={handleForecastFuture}
                    disabled={!predictions || isLoading || isForecastLoading}
                    variant="outline"
                    className="border-slate-500/70 bg-slate-900/70 text-slate-100 hover:bg-slate-800 hover:text-slate-50"
                  >
                    {isForecastLoading ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <TrendingUp className="h-4 w-4 mr-2" />
                    )}
                    Прогноз
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {futureForecast ? (
                  <>
                    <span className="sr-only" data-testid="last-observed-date">
                      {lastObservedDate}
                    </span>
                    <span className="sr-only" data-testid="forecast-start-date">
                      {forecastStartDate}
                    </span>
                    <div
                      className="h-[400px] cursor-grab select-none active:cursor-grabbing"
                      role="application"
                      onPointerDown={(event) =>
                        startChartPan('future', event, futureWindow, futureChartData.length)
                      }
                      onMouseLeave={stopChartPan}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={futureChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                          <XAxis 
                            dataKey="date" 
                            tick={CHART_TICK}
                            stroke={CHART_AXIS}
                            angle={-45}
                            textAnchor="end"
                            height={80}
                          />
                          <YAxis tick={CHART_TICK} stroke={CHART_AXIS} domain={chartDomainWithPadding} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} isAnimationActive={false} />
                          <Legend wrapperStyle={LEGEND_STYLE} formatter={legendFormatter} />
                          <ReferenceLine 
                            x={lastObservedDate || undefined}
                            stroke="#94a3b8" 
                            strokeDasharray="3 3"
                            label={{ value: 'Сегодня', position: 'top', fontSize: 10 }}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="actual" 
                            stroke={COLORS.actual} 
                            strokeWidth={2}
                            isAnimationActive={false}
                            dot={false}
                            name="Фактические"
                          />
                          <Line 
                            type="monotone" 
                            dataKey="hybrid" 
                            stroke={COLORS.hybrid} 
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            isAnimationActive={false}
                            dot={false}
                            name="Прогноз"
                          />
                          <Brush
                            dataKey="date"
                            height={24}
                            stroke={COLORS.hybrid}
                            travellerWidth={8}
                            startIndex={futureWindow?.startIndex}
                            endIndex={futureWindow?.endIndex}
                            onChange={handleBrushChange('future', futureChartData.length)}
                            tickFormatter={() => ''}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                ) : (
                  <div className="h-[400px] flex items-center justify-center text-slate-400">
                    Сначала запустите анализ, затем нажмите "Прогноз" для получения предсказаний
                  </div>
                )}
              </CardContent>
            </Card>

            {futureForecast && (
              <Card className="border-slate-700/70 bg-slate-900/65 backdrop-blur-md">
                <CardHeader>
                  <CardTitle className="text-sm text-slate-50">Таблица прогноза</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto max-h-60">
                    <table className="w-full text-sm text-slate-100">
                      <thead className="sticky top-0 bg-slate-900/95">
                        <tr className="border-b border-slate-700/70">
                          <th className="py-2 px-3 text-left text-slate-200">Дата</th>
                          <th className="py-2 px-3 text-right text-slate-200">Прогноз (руб.)</th>
                          <th className="py-2 px-3 text-right text-slate-200">Ниж. граница</th>
                          <th className="py-2 px-3 text-right text-slate-200">Верх. граница</th>
                        </tr>
                      </thead>
                      <tbody>
                        {futureForecast.dates.map((date: string, i: number) => (
                          <tr key={date} className="border-b border-slate-700/70 hover:bg-slate-800/60">
                            <td className="py-2 px-3 text-slate-100">{date}</td>
                            <td className="text-right py-2 px-3 font-medium text-amber-300">
                              {futureForecast.hybrid[i].toFixed(2)}
                            </td>
                            <td className="text-right py-2 px-3 text-slate-300">
                              {futureForecast.conf_int_lower[i]?.toFixed(2) || '—'}
                            </td>
                            <td className="text-right py-2 px-3 text-slate-300">
                              {futureForecast.conf_int_upper[i]?.toFixed(2) || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Информация о моделях */}
        <Card className="mt-6 border-slate-700/70 bg-slate-900/65 backdrop-blur-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-serif text-slate-50">
              <Brain className="h-5 w-5 text-amber-300" />
              О гибридной модели
            </CardTitle>
          </CardHeader>
          <CardContent className="max-w-none text-slate-300">
            <div className="grid md:grid-cols-3 gap-6 text-sm">
              <div>
                <h4 className="mb-2 font-medium text-blue-300">ARIMA</h4>
                <p className="text-slate-300">
                  Моделирует линейную компоненту временного ряда. 
                  Автоматический подбор параметров (p, d, q) через AIC критерий.
                </p>
              </div>
              <div>
                <h4 className="mb-2 font-medium text-cyan-300">LSTM</h4>
                <p className="text-slate-300">
                  Глубокая нейронная сеть для захвата нелинейных паттернов 
                  в остатках ARIMA. Два LSTM слоя с dropout для регуляризации.
                </p>
              </div>
              <div>
                <h4 className="mb-2 font-medium text-amber-300">Гибридная модель</h4>
                <p className="text-slate-300">
                  Комбинирует прогнозы: Final = ARIMA + LSTM(остатки). 
                  Учитывает как линейные, так и нелинейные зависимости.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Подвал */}
      <footer className="mt-auto border-t border-slate-700/70 bg-slate-950/70 py-4 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 text-center text-sm text-slate-300">
          <p>
            Гибридная модель ARIMA-LSTM для прогнозирования акций Сбербанка
          </p>
          <p className="text-xs mt-1">
            Прикладная информатика — Курсовая работа
          </p>
        </div>
      </footer>
    </div>
  );
}
