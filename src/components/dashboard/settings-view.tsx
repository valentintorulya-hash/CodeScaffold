import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshCw, Play, AlertCircle, Settings } from 'lucide-react';

interface SettingsViewProps {
  params: {
    startDate: string;
    endDate: string;
    lookBack: number;
    lstmUnits1: number;
    lstmUnits2: number;
    epochs: number;
    batchSize: number;
  };
  setParams: (params: any) => void;
  handleRunAnalysis: () => void;
  isLoading: boolean;
  progress: number;
  status: string;
  error: string | null;
  serviceStatus: 'checking' | 'online' | 'offline';
}

export function SettingsView({
  params,
  setParams,
  handleRunAnalysis,
  isLoading,
  progress,
  status,
  error,
  serviceStatus,
}: SettingsViewProps) {
  return (
    <div className="space-y-4">
      <Card className="border-slate-700/70 bg-slate-900/65 shadow-xl backdrop-blur-md">
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
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 [&_label]:text-slate-200 [&_input]:border-slate-500/70 [&_input]:bg-slate-950/40 [&_input]:text-slate-100 [&_input]:placeholder:text-slate-400">
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
              <Label htmlFor="lstmUnits1">LSTM слои (1)</Label>
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
              <Label htmlFor="lstmUnits2">LSTM слои (2)</Label>
              <Input
                id="lstmUnits2"
                type="number"
                value={params.lstmUnits2}
                onChange={(e) => {
                  const nextValue = Number.parseInt(e.target.value, 10);
                  if (Number.isNaN(nextValue)) return;
                  setParams({ ...params, lstmUnits2: nextValue });
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
            <div className="flex items-end col-span-1 md:col-span-2 lg:col-span-1">
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
    </div>
  );
}
