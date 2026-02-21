import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { BarChart3, Activity, TrendingDown, Zap } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ChartScrollbar } from '@/components/ui/chart-scrollbar';
import { RangeSelector } from '@/components/dashboard/range-selector';
import { DataInfo, StationarityResult } from '@/lib/ml-api';
import { ChartWindow, chartDomainWithPadding } from '@/lib/chart-utils';
import { PanChartKey, PricePoint } from '@/lib/dashboard-types';
import { COLORS, CHART_GRID, TOOLTIP_STYLE, CHART_AXIS, CHART_TICK } from '@/lib/dashboard-constants';

interface AnalysisViewProps {
  dataInfo: DataInfo | null;
  priceData: PricePoint[];
  visiblePriceData: PricePoint[];
  analysisWindow: ChartWindow | null;
  stationarity: StationarityResult | null;
  bestModel: string;
  onRangeSelect: (days: number | 'all') => void;
  onChartPan: (event: React.PointerEvent<HTMLDivElement>, window: ChartWindow | null, length: number) => void;
  onStopPan: () => void;
  onScrollbarChange: (window: { startIndex: number; endIndex: number }) => void;
}

export function AnalysisView({
  dataInfo,
  priceData,
  visiblePriceData,
  analysisWindow,
  stationarity,
  bestModel,
  onRangeSelect,
  onChartPan,
  onStopPan,
  onScrollbarChange,
}: AnalysisViewProps) {
  return (
    <div className="space-y-6">
      {/* Информация о данных */}
      {dataInfo && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-slate-700/70 bg-slate-900/60 backdrop-blur-sm">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-amber-300" />
                <div>
                  <p className="text-sm text-slate-300">Всего записей</p>
                  <p className="text-2xl font-bold text-slate-50">{dataInfo.total_records}</p>
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
                  <p className="text-2xl font-bold text-slate-50">{dataInfo.train_records}</p>
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
                  <p className="text-2xl font-bold text-slate-50">{dataInfo.test_records}</p>
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

      {/* Исходные данные */}
      <Card className="border-slate-700/70 bg-slate-900/65 backdrop-blur-md">
        <CardHeader>
          <CardTitle className="font-serif text-slate-50">Исторические данные акций SBER</CardTitle>
          <CardDescription className="text-slate-300">
            Цена акций Сбербанка на Московской бирже
          </CardDescription>
        </CardHeader>
        <CardContent>
          {priceData.length > 0 ? (
            <>
              <RangeSelector dataLength={priceData.length} onRangeSelect={onRangeSelect} />
              <div
                className="h-[350px] cursor-grab select-none active:cursor-grabbing"
                role="application"
                onPointerDown={(event) =>
                  onChartPan(event, analysisWindow, priceData.length)
                }
                onPointerLeave={onStopPan}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={visiblePriceData}>
                    <defs>
                      <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.hybrid} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={COLORS.hybrid} stopOpacity={0} />
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
                    <Tooltip 
                      contentStyle={TOOLTIP_STYLE} 
                      isAnimationActive={false} 
                      cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="close"
                      stroke={COLORS.hybrid}
                      fillOpacity={1}
                      isAnimationActive={false}
                      fill="url(#colorPrice)"
                      name="Цена закрытия"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <ChartScrollbar
                totalCount={priceData.length}
                window={analysisWindow}
                onChange={onScrollbarChange}
                className="mt-2"
              />
            </>
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
    </div>
  );
}
