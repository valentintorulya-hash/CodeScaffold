import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ComposedChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ChartScrollbar } from '@/components/ui/chart-scrollbar';
import { RangeSelector } from '@/components/dashboard/range-selector';
import { Predictions } from '@/lib/ml-api';
import { ChartWindow, chartDomainWithPadding } from '@/lib/chart-utils';
import { COLORS, CHART_GRID, TOOLTIP_STYLE, CHART_AXIS, CHART_TICK, CHART_TICK_SMALL, LEGEND_STYLE, legendFormatter } from '@/lib/dashboard-constants';

interface ForecastViewProps {
  forecastChartData: any[];
  visibleForecastData: any[];
  forecastWindow: ChartWindow | null;
  predictions: Predictions | null;
  modelErrors: any;
  onRangeSelect: (days: number | 'all') => void;
  onChartPan: (event: React.PointerEvent<HTMLDivElement>, window: ChartWindow | null, length: number) => void;
  onStopPan: () => void;
  onScrollbarChange: (window: { startIndex: number; endIndex: number }) => void;
}

export function ForecastView({
  forecastChartData,
  visibleForecastData,
  forecastWindow,
  predictions,
  modelErrors,
  onRangeSelect,
  onChartPan,
  onStopPan,
  onScrollbarChange,
}: ForecastViewProps) {
  return (
    <div className="space-y-4">
      <Card className="border-slate-700/70 bg-slate-900/65 backdrop-blur-md">
        <CardHeader>
          <CardTitle className="font-serif text-slate-50">Сравнение прогнозов моделей</CardTitle>
          <CardDescription className="text-slate-300">
            Фактические значения на тестовом периоде vs прогнозы ARIMA, LSTM и гибридной модели
          </CardDescription>
        </CardHeader>
        <CardContent>
          {forecastChartData.length > 0 ? (
            <>
              <RangeSelector dataLength={forecastChartData.length} onRangeSelect={onRangeSelect} />
              <div
              className="h-[400px] cursor-grab select-none active:cursor-grabbing"
              role="application"
              onPointerDown={(event) =>
                onChartPan(event, forecastWindow, forecastChartData.length)
              }
              onPointerLeave={onStopPan}
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={visibleForecastData}>
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
                  <Tooltip 
                    contentStyle={TOOLTIP_STYLE} 
                    isAnimationActive={false} 
                    cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                  />
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
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <ChartScrollbar
              totalCount={forecastChartData.length}
              window={forecastWindow}
              onChange={onScrollbarChange}
              className="mt-2"
            />
            </>
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
                      <Tooltip 
                        contentStyle={TOOLTIP_STYLE} 
                        cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                      />
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
    </div>
  );
}
