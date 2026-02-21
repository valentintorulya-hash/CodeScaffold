
export const chartDomainWithPadding = ([dataMin, dataMax]: [number, number]): [number, number] => {
  const safeMin = Number.isFinite(dataMin) ? dataMin : 0;
  const safeMax = Number.isFinite(dataMax) ? dataMax : safeMin + 1;

  if (safeMin === safeMax) {
    const pad = Math.max(Math.abs(safeMin) * 0.02, 1);
    return [safeMin - pad, safeMax + pad];
  }

  return [Math.floor(safeMin * 0.98), Math.ceil(safeMax * 1.02)];
};

export interface ChartWindow {
  startIndex: number;
  endIndex: number;
}

export const DEFAULT_CHART_WINDOW = 90;

export const createInitialWindow = (dataLength: number): ChartWindow | null => {
  if (dataLength <= 0) return null;
  const visiblePoints = Math.min(DEFAULT_CHART_WINDOW, dataLength);
  return {
    startIndex: dataLength - visiblePoints,
    endIndex: dataLength - 1,
  };
};

export const normalizeWindow = (window: ChartWindow, dataLength: number): ChartWindow | null => {
  if (dataLength <= 0) return null;

  const start = Math.max(0, Math.min(window.startIndex, dataLength - 1));
  const end = Math.max(start, Math.min(window.endIndex, dataLength - 1));

  return { startIndex: start, endIndex: end };
};
