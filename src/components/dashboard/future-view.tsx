import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { RefreshCw, TrendingUp } from 'lucide-react';
import { ChartScrollbar } from '@/components/ui/chart-scrollbar';
import { RangeSelector } from '@/components/dashboard/range-selector';
import { FutureForecastResult, Predictions } from '@/lib/ml-api';
import { ChartWindow, chartDomainWithPadding } from '@/lib/chart-utils';
import { COLORS, CHART_GRID, TOOLTIP_STYLE, CHART_AXIS, CHART_TICK, LEGEND_STYLE, legendFormatter } from '@/lib/dashboard-constants';

interface FutureViewProps {
  futureForecast: FutureForecastResult | null;
  futureChartData: any[];
  visibleFutureData: any[];
  futureWindow: ChartWindow | null;
  predictions: Predictions | null;
  isForecastLoading: boolean;
  isLoading: boolean;
  lastObservedDate: string;
  forecastStartDate: string;
  handleForecastFuture: () => void;
  onRangeSelect: (days: number | 'all') => void;
  onChartPan: (event: React.PointerEvent<HTMLDivElement>, window: ChartWindow | null, length: number) => void;
  onStopPan: () => void;
  onScrollbarChange: (window: { startIndex: number; endIndex: number }) => void;
}

export function FutureView({
  futureForecast,
  futureChartData,
  visibleFutureData,
  futureWindow,
  predictions,
  isForecastLoading,
  isLoading,
  lastObservedDate,
  forecastStartDate,
  handleForecastFuture,
  onRangeSelect,
  onChartPan,
  onStopPan,
  onScrollbarChange,
}: FutureViewProps) {
  return (
    <div className="space-y-4">
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
              <RangeSelector dataLength={futureChartData.length} onRangeSelect={onRangeSelect} />
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
                    onChartPan(event, futureWindow, futureChartData.length)
                  }
                  onPointerLeave={onStopPan}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={visibleFutureData}>
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
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <ChartScrollbar
                  totalCount={futureChartData.length}
                  window={futureWindow}
                  onChange={onScrollbarChange}
                  className="mt-2"
                />
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
            <div className="overflow-x-auto max-h-60 custom-scrollbar">
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
    </div>
  );
}
