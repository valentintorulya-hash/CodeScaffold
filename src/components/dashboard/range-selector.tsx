import { Button } from "@/components/ui/button";

interface RangeSelectorProps {
  dataLength: number;
  onRangeSelect: (days: number | 'all') => void;
}

export function RangeSelector({ dataLength, onRangeSelect }: RangeSelectorProps) {
  return (
    <div className="flex gap-1 mb-4">
      <Button variant="outline" size="sm" onClick={() => onRangeSelect(7)} className="h-7 text-xs bg-slate-800 border-slate-600 text-white hover:bg-slate-700 hover:text-white">1Н</Button>
      <Button variant="outline" size="sm" onClick={() => onRangeSelect(30)} className="h-7 text-xs bg-slate-800 border-slate-600 text-white hover:bg-slate-700 hover:text-white">1М</Button>
      <Button variant="outline" size="sm" onClick={() => onRangeSelect(90)} className="h-7 text-xs bg-slate-800 border-slate-600 text-white hover:bg-slate-700 hover:text-white">3М</Button>
      <Button variant="outline" size="sm" onClick={() => onRangeSelect(180)} className="h-7 text-xs bg-slate-800 border-slate-600 text-white hover:bg-slate-700 hover:text-white">6М</Button>
      <Button variant="outline" size="sm" onClick={() => onRangeSelect(365)} className="h-7 text-xs bg-slate-800 border-slate-600 text-white hover:bg-slate-700 hover:text-white">1Г</Button>
      <Button variant="outline" size="sm" onClick={() => onRangeSelect('all')} className="h-7 text-xs bg-slate-800 border-slate-600 text-white hover:bg-slate-700 hover:text-white">Все</Button>
    </div>
  );
}
