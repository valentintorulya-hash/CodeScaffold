export const COLORS = {
  actual: '#cbd5e1',
  arima: '#60a5fa',
  lstm: '#22d3ee',
  hybrid: '#f59e0b',
  forecast: '#fbbf24',
  confidence: 'rgba(245, 158, 11, 0.22)',
};

export const CHART_GRID = 'rgba(148, 163, 184, 0.2)';

export const TOOLTIP_STYLE = {
  backgroundColor: 'rgba(15, 23, 42, 0.92)',
  border: '1px solid rgba(148, 163, 184, 0.35)',
  borderRadius: '10px',
  color: '#e2e8f0',
  backdropFilter: 'blur(8px)',
};

export const CHART_TICK = { fontSize: 10, fill: '#cbd5e1' };
export const CHART_TICK_SMALL = { fontSize: 8, fill: '#cbd5e1' };
export const CHART_AXIS = '#64748b';
export const LEGEND_STYLE = { color: '#e2e8f0' };

export const legendFormatter = (value: string) => value;

export const chartDomainWithPadding = (min: number, max: number) => {
    const padding = (max - min) * 0.1;
    return [Math.floor(min - padding), Math.ceil(max + padding)];
};
