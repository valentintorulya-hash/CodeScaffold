import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshCw, Play, AlertCircle, Settings, Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface SettingsViewProps {
  params: {
    startDate: string;
    endDate: string;
    lookBack: number | string;
    lstmUnits1: number | string;
    lstmUnits2: number | string;
    epochs: number | string;
    batchSize: number | string;
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
  const handleNumberChange = (field: string, value: string) => {
    if (value === '') {
      setParams({ ...params, [field]: '' });
      return;
    }
    const nextValue = Number.parseInt(value, 10);
    if (!Number.isNaN(nextValue)) {
      setParams({ ...params, [field]: nextValue });
    }
  };

  const parseDate = (dateStr: string) => {
    if (!dateStr) return undefined;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return undefined;
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  };

  return (
    <div className="space-y-4">
      <style jsx global>{`
        .custom-inputs input[type="number"] {
          color-scheme: dark;
        }
      `}</style>
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
          <div className="custom-inputs grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 [&_label]:text-slate-200 [&_input]:border-slate-500/70 [&_input]:bg-slate-950/40 [&_input]:text-slate-100 [&_input]:placeholder:text-slate-400">
            <div>
              <Label htmlFor="startDate" className="mb-2 block">Начальная дата</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="startDate"
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal bg-slate-950/40 border-slate-500/70 text-slate-100 hover:bg-slate-900 hover:text-slate-100",
                      !params.startDate && "text-slate-400"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-slate-400" />
                    {params.startDate ? format(parseDate(params.startDate)!, "PPP", { locale: ru }) : <span>Выберите дату</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 border-slate-700 bg-slate-950" align="start">
                  <Calendar
                    mode="single"
                    selected={parseDate(params.startDate)}
                    onSelect={(date) => setParams({ ...params, startDate: date ? format(date, 'yyyy-MM-dd') : '' })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label htmlFor="endDate" className="mb-2 block">Конечная дата</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="endDate"
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal bg-slate-950/40 border-slate-500/70 text-slate-100 hover:bg-slate-900 hover:text-slate-100",
                      !params.endDate && "text-slate-400"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-slate-400" />
                    {params.endDate ? format(parseDate(params.endDate)!, "PPP", { locale: ru }) : <span>Выберите дату</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 border-slate-700 bg-slate-950" align="start">
                  <Calendar
                    mode="single"
                    selected={parseDate(params.endDate)}
                    onSelect={(date) => setParams({ ...params, endDate: date ? format(date, 'yyyy-MM-dd') : '' })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label htmlFor="lookBack">Размер окна (дней)</Label>
              <Input
                id="lookBack"
                type="number"
                value={params.lookBack}
                onChange={(e) => handleNumberChange('lookBack', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="lstmUnits1">Размер 1-го слоя LSTM</Label>
              <Input
                id="lstmUnits1"
                type="number"
                value={params.lstmUnits1}
                onChange={(e) => handleNumberChange('lstmUnits1', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="lstmUnits2">Размер 2-го слоя LSTM</Label>
              <Input
                id="lstmUnits2"
                type="number"
                value={params.lstmUnits2}
                onChange={(e) => handleNumberChange('lstmUnits2', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="epochs">Эпохи</Label>
              <Input
                id="epochs"
                type="number"
                value={params.epochs}
                onChange={(e) => handleNumberChange('epochs', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="batchSize">Размер батча</Label>
              <Input
                id="batchSize"
                type="number"
                value={params.batchSize}
                onChange={(e) => handleNumberChange('batchSize', e.target.value)}
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
