'use client';

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { BeamsBackground } from '@/components/ui/beams-background';
import { 
  CheckCircle2, AlertCircle, TrendingUp, Brain
} from 'lucide-react';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { AppSidebar } from "@/components/app-sidebar"

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
import {
  createInitialWindow,
  type ChartWindow,
} from '@/lib/chart-utils';
import { PanChartKey, PricePoint, DashboardState } from '@/lib/dashboard-types';

// Views
import { SettingsView } from '@/components/dashboard/settings-view';
import { ForecastView } from '@/components/dashboard/forecast-view';
import { AnalysisView } from '@/components/dashboard/analysis-view';
import { ComparisonView } from '@/components/dashboard/comparison-view';
import { FutureView } from '@/components/dashboard/future-view';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const ANALYSIS_SNAPSHOT_KEY = 'dashboard-analysis-snapshot:v1';
const PAN_SENSITIVITY = 1.2;

interface PersistedAnalysisSnapshot extends DashboardState {
  version: 1;
  progress: number;
  status: string;
}

export default function Dashboard() {
  // Navigation State
  const [activeView, setActiveView] = useState('forecast');

  // App State
  const [isLoading, setIsLoading] = useState(false);
  const [isForecastLoading, setIsForecastLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [serviceStatus, setServiceStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [isSnapshotReady, setIsSnapshotReady] = useState(false);

  // Data State
  const [dataInfo, setDataInfo] = useState<DataInfo | null>(null);
  const [priceData, setPriceData] = useState<PricePoint[]>([]);
  const [predictions, setPredictions] = useState<Predictions | null>(null);
  const [metrics, setMetrics] = useState<ModelMetrics[]>([]);
  const [bestModel, setBestModel] = useState<string>('');
  const [stationarity, setStationarity] = useState<StationarityResult | null>(null);
  const [futureForecast, setFutureForecast] = useState<FutureForecastResult | null>(null);
  
  // Windows
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

  // Model Params
  const [params, setParams] = useState({
    startDate: '2021-01-01',
    endDate: '',
    lookBack: 60,
    lstmUnits1: 50,
    lstmUnits2: 50,
    epochs: 50,
    batchSize: 32,
  });

  // Restore Snapshot
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
      
      // Restore windows if needed, or let effects handle it
      setForecastWindow(snapshot.forecastWindow);
      setAnalysisWindow(snapshot.analysisWindow);
      setFutureWindow(snapshot.futureWindow);
    } catch {
      window.localStorage.removeItem(ANALYSIS_SNAPSHOT_KEY);
    } finally {
      setIsSnapshotReady(true);
    }
  }, []);

  // Save Snapshot
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
        forecastWindow,
        analysisWindow,
        futureWindow,
        progress,
        status,
      };

      window.localStorage.setItem(ANALYSIS_SNAPSHOT_KEY, JSON.stringify(snapshot));
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [
    bestModel, dataInfo, futureForecast, isLoading, isSnapshotReady, metrics,
    predictions, priceData, progress, stationarity, status,
    forecastWindow, analysisWindow, futureWindow
  ]);

  // Health Check
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

  // Run Analysis
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
        setPredictions(result.predictions);
        setStationarity(result.stationarity);

        if (result.dates && result.close) {
          const chartData = result.dates.map((date: string, i: number) => ({
            date: date.slice(0, 10),
            close: result.close[i],
            avg_price: result.avg_price?.[i] ?? result.close[i],
          }));
          setPriceData(chartData);
        }

        setProgress(100);
        setStatus('Анализ завершён! Для прогноза на будущее перейдите в раздел «Прогноз на будущее».');
        
        // Auto-switch to Forecast view
        setActiveView('forecast');
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

  // Future Forecast
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

  // Chart Logic
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

  const setChartRange = useCallback((chartKey: PanChartKey, days: number | 'all', dataLength: number) => {
    if (dataLength <= 0) return;
    
    let window: ChartWindow;
    if (days === 'all') {
      window = { startIndex: 0, endIndex: dataLength - 1 };
    } else {
      window = {
        startIndex: Math.max(0, dataLength - days),
        endIndex: dataLength - 1
      };
    }
    applyWindowByChart(chartKey, window);
  }, [applyWindowByChart]);

  const handleScrollbarChange = useCallback(
    (chartKey: PanChartKey) => (window: { startIndex: number; endIndex: number }) => {
      applyWindowByChart(chartKey, window);
    },
    [applyWindowByChart]
  );

  const startChartPan = useCallback(
    (
      chartKey: PanChartKey,
      event: ReactPointerEvent<HTMLDivElement>,
      currentWindow: ChartWindow | null,
      dataLength: number
    ) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);

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
    (event: PointerEvent) => {
      const panState = panStateRef.current;
      if (!panState) return;
      
      event.preventDefault();
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

        if (shift === 0) return;

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

  useEffect(() => {
    window.addEventListener('pointermove', moveChartPan);
    window.addEventListener('pointerup', stopChartPan);
    window.addEventListener('pointercancel', stopChartPan);
    window.addEventListener('blur', stopChartPan);

    return () => {
      window.removeEventListener('pointermove', moveChartPan);
      window.removeEventListener('pointerup', stopChartPan);
      window.removeEventListener('pointercancel', stopChartPan);
      window.removeEventListener('blur', stopChartPan);
    };
  }, [moveChartPan, stopChartPan]);

  // Prepare Data for Views
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

  // Initialize Windows
  useEffect(() => {
    if (!forecastWindow && forecastChartData.length > 0) {
        setForecastWindow(createInitialWindow(forecastChartData.length));
    }
  }, [forecastChartData.length, forecastWindow]);

  useEffect(() => {
    if (!analysisWindow && priceData.length > 0) {
        setAnalysisWindow(createInitialWindow(priceData.length));
    }
  }, [priceData.length, analysisWindow]);

  useEffect(() => {
    if (!futureWindow && futureChartData.length > 0) {
        setFutureWindow(createInitialWindow(futureChartData.length));
    }
  }, [futureChartData.length, futureWindow]);

  const visibleForecastData = useMemo(() => {
    if (!forecastWindow) return forecastChartData;
    return forecastChartData.slice(forecastWindow.startIndex, forecastWindow.endIndex + 1);
  }, [forecastChartData, forecastWindow]);

  const visiblePriceData = useMemo(() => {
    if (!analysisWindow) return priceData;
    return priceData.slice(analysisWindow.startIndex, analysisWindow.endIndex + 1);
  }, [priceData, analysisWindow]);

  const visibleFutureData = useMemo(() => {
    if (!futureWindow) return futureChartData;
    return futureChartData.slice(futureWindow.startIndex, futureWindow.endIndex + 1);
  }, [futureChartData, futureWindow]);

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

  // Title Mapping
  const getTitle = () => {
    switch (activeView) {
      case 'forecast': return 'Прогнозы';
      case 'analysis': return 'Анализ данных';
      case 'comparison': return 'Сравнение моделей';
      case 'future': return 'Прогноз на будущее';
      case 'settings': return 'Настройки';
      default: return 'Дашборд';
    }
  };

  return (
    <SidebarProvider>
      <AppSidebar activeView={activeView} onViewChange={setActiveView} />
      <SidebarInset className="bg-slate-950">
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 border-b border-slate-800 bg-slate-950/80 backdrop-blur-xl supports-[backdrop-filter]:bg-slate-950/60 sticky top-0 z-50">
          <div className="flex items-center gap-2 px-4 w-full justify-between">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="-ml-1 text-slate-400 hover:text-slate-50 hover:bg-slate-800 transition-colors duration-200" />
              <Separator orientation="vertical" className="mr-2 h-4 bg-slate-700" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem className="hidden md:block">
                    <BreadcrumbLink 
                      href="#" 
                      onClick={() => setActiveView('forecast')} 
                      className="text-slate-400 hover:text-amber-400 transition-colors duration-200 font-medium"
                    >
                      Прогноз СБЕР
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden md:block text-slate-600" />
                  <BreadcrumbItem>
                    <BreadcrumbPage className="text-slate-100 font-semibold tracking-tight">{getTitle()}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            
            <div className="flex items-center gap-4">
              <Badge 
                variant="outline"
                className={`
                  flex items-center gap-1.5 border px-3 py-1 transition-all duration-300
                  ${serviceStatus === 'online' 
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.1)]' 
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-400'}
                `}
              >
                {serviceStatus === 'online' ? (
                  <>
                    <div className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </div>
                    <span className="hidden sm:inline font-medium text-xs tracking-wide uppercase">Онлайн</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3 w-3" />
                    <span className="hidden sm:inline font-medium text-xs tracking-wide uppercase">Оффлайн</span>
                  </>
                )}
              </Badge>
            </div>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-6 p-6 pt-6 bg-slate-950 min-h-screen relative overflow-hidden">
          <BeamsBackground />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.18),transparent_48%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_90%_15%,rgba(245,158,11,0.16),transparent_42%)]" />
          
          <div className="relative z-10 max-w-7xl w-full mx-auto">
            {activeView === 'settings' && (
              <SettingsView 
                params={params} 
                setParams={setParams} 
                handleRunAnalysis={handleRunAnalysis}
                isLoading={isLoading}
                progress={progress}
                status={status}
                error={error}
                serviceStatus={serviceStatus}
              />
            )}

            {activeView === 'forecast' && (
              <>
                <ForecastView
                  forecastChartData={forecastChartData}
                  visibleForecastData={visibleForecastData}
                  forecastWindow={forecastWindow}
                  predictions={predictions}
                  modelErrors={modelErrors}
                  onRangeSelect={(days) => setChartRange('forecast', days, forecastChartData.length)}
                  onChartPan={(e, w, l) => startChartPan('forecast', e, w, l)}
                  onStopPan={stopChartPan}
                  onScrollbarChange={handleScrollbarChange('forecast')}
                />
                
                {/* Информация о моделях - отображаем только на главной */}
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
              </>
            )}

            {activeView === 'analysis' && (
              <AnalysisView
                dataInfo={dataInfo}
                priceData={priceData}
                visiblePriceData={visiblePriceData}
                analysisWindow={analysisWindow}
                stationarity={stationarity}
                bestModel={bestModel}
                onRangeSelect={(days) => setChartRange('analysis', days, priceData.length)}
                onChartPan={(e, w, l) => startChartPan('analysis', e, w, l)}
                onStopPan={stopChartPan}
                onScrollbarChange={handleScrollbarChange('analysis')}
              />
            )}

            {activeView === 'comparison' && (
              <ComparisonView 
                metrics={metrics} 
                bestModel={bestModel} 
              />
            )}

            {activeView === 'future' && (
              <FutureView
                futureForecast={futureForecast}
                futureChartData={futureChartData}
                visibleFutureData={visibleFutureData}
                futureWindow={futureWindow}
                predictions={predictions}
                isForecastLoading={isForecastLoading}
                isLoading={isLoading}
                lastObservedDate={lastObservedDate}
                forecastStartDate={forecastStartDate}
                handleForecastFuture={handleForecastFuture}
                onRangeSelect={(days) => setChartRange('future', days, futureChartData.length)}
                onChartPan={(e, w, l) => startChartPan('future', e, w, l)}
                onStopPan={stopChartPan}
                onScrollbarChange={handleScrollbarChange('future')}
              />
            )}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
