
'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { GripVertical } from 'lucide-react';

interface ChartScrollbarProps {
  totalCount: number;
  window: { startIndex: number; endIndex: number } | null;
  onChange: (window: { startIndex: number; endIndex: number }) => void;
  className?: string;
  minWindowSize?: number;
}

export function ChartScrollbar({
  totalCount,
  window,
  onChange,
  className,
  minWindowSize = 5,
}: ChartScrollbarProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const isDraggingRef = React.useRef(false);
  const dragTypeRef = React.useRef<'move' | 'resize-left' | 'resize-right' | null>(null);
  const startXRef = React.useRef(0);
  const initialWindowRef = React.useRef<{ startIndex: number; endIndex: number } | null>(null);

  // Derive percentages for positioning
  const { leftPercent, widthPercent } = React.useMemo(() => {
    if (!window || totalCount <= 0) return { leftPercent: 0, widthPercent: 100 };
    
    const start = Math.max(0, Math.min(window.startIndex, totalCount - 1));
    const end = Math.max(start, Math.min(window.endIndex, totalCount - 1));
    const count = end - start + 1;
    
    return {
      leftPercent: (start / totalCount) * 100,
      widthPercent: (count / totalCount) * 100,
    };
  }, [window, totalCount]);

  const handlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    type: 'move' | 'resize-left' | 'resize-right'
  ) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!window || totalCount <= 0) return;

    isDraggingRef.current = true;
    dragTypeRef.current = type;
    startXRef.current = e.clientX;
    initialWindowRef.current = { ...window };
    
    // Set capture to ensure we receive events even if cursor leaves the element
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !initialWindowRef.current || !containerRef.current) return;
    
    e.preventDefault();
    e.stopPropagation();

    const containerWidth = containerRef.current.clientWidth;
    if (containerWidth === 0) return;

    const deltaX = e.clientX - startXRef.current;
    const deltaItems = Math.round((deltaX / containerWidth) * totalCount);
    
    if (deltaItems === 0) return;

    let newStart = initialWindowRef.current.startIndex;
    let newEnd = initialWindowRef.current.endIndex;

    if (dragTypeRef.current === 'move') {
      const currentWidth = newEnd - newStart;
      newStart = Math.max(0, Math.min(initialWindowRef.current.startIndex + deltaItems, totalCount - 1 - currentWidth));
      newEnd = newStart + currentWidth;
    } else if (dragTypeRef.current === 'resize-left') {
      newStart = Math.max(0, Math.min(initialWindowRef.current.startIndex + deltaItems, newEnd - minWindowSize));
    } else if (dragTypeRef.current === 'resize-right') {
      newEnd = Math.max(newStart + minWindowSize, Math.min(initialWindowRef.current.endIndex + deltaItems, totalCount - 1));
    }

    // Only update if changed
    if (newStart !== window?.startIndex || newEnd !== window?.endIndex) {
      onChange({ startIndex: newStart, endIndex: newEnd });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    
    isDraggingRef.current = false;
    dragTypeRef.current = null;
    (e.target as Element).releasePointerCapture(e.pointerId);
  };

  if (!window || totalCount <= 0) return null;

  return (
    <div 
      ref={containerRef}
      className={cn(
        "relative h-6 w-full select-none rounded bg-slate-800/50 touch-none",
        className
      )}
    >
      {/* Track Background (Optional: could add ticks or mini-chart here) */}
      
      {/* Thumb */}
      <div
        className="absolute top-0 bottom-0 flex items-center justify-center bg-slate-700/80 hover:bg-slate-600/80 rounded cursor-grab active:cursor-grabbing group transition-colors"
        style={{
          left: `${leftPercent}%`,
          width: `${widthPercent}%`,
        }}
        onPointerDown={(e) => handlePointerDown(e, 'move')}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Center Grip Icon */}
        <GripVertical className="h-3 w-3 text-slate-400 opacity-50 group-hover:opacity-100 transition-opacity" />

        {/* Left Handle */}
        <div
          className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize flex items-center justify-center group/handle hover:bg-amber-500/20 transition-colors"
          onPointerDown={(e) => handlePointerDown(e, 'resize-left')}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <div className="h-4 w-1 bg-amber-500/50 rounded-full group-hover/handle:bg-amber-500 transition-colors" />
        </div>

        {/* Right Handle */}
        <div
          className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize flex items-center justify-center group/handle hover:bg-amber-500/20 transition-colors"
          onPointerDown={(e) => handlePointerDown(e, 'resize-right')}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <div className="h-4 w-1 bg-amber-500/50 rounded-full group-hover/handle:bg-amber-500 transition-colors" />
        </div>
      </div>
    </div>
  );
}
