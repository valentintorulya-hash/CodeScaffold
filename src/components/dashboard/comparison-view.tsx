import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ModelMetrics } from '@/lib/ml-api';
import { COLORS, CHART_GRID, TOOLTIP_STYLE, CHART_AXIS, CHART_TICK_SMALL, LEGEND_STYLE, legendFormatter } from '@/lib/dashboard-constants';

interface ComparisonViewProps {
  metrics: ModelMetrics[];
  bestModel: string;
}

export function ComparisonView({ metrics, bestModel }: ComparisonViewProps) {
  return (
    <div className="space-y-4">
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
                    <Tooltip 
                      contentStyle={TOOLTIP_STYLE} 
                      cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                    />
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
                    <Tooltip 
                      contentStyle={TOOLTIP_STYLE} 
                      cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                    />
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
    </div>
  );
}
