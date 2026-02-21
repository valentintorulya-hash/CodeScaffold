
import { describe, it, expect } from 'bun:test';
import { chartDomainWithPadding, createInitialWindow, normalizeWindow, DEFAULT_CHART_WINDOW } from './chart-utils';

describe('Chart Utils', () => {
  describe('chartDomainWithPadding', () => {
    it('should add padding to min and max', () => {
      const [min, max] = chartDomainWithPadding([100, 200]);
      expect(min).toBeLessThan(100);
      expect(max).toBeGreaterThan(200);
    });

    it('should handle flat line (min === max)', () => {
      const [min, max] = chartDomainWithPadding([100, 100]);
      expect(min).toBe(98); // 100 - 2%
      expect(max).toBe(102); // 100 + 2%
    });

    it('should handle zero values', () => {
      const [min, max] = chartDomainWithPadding([0, 0]);
      expect(min).toBe(-1);
      expect(max).toBe(1);
    });
  });

  describe('createInitialWindow', () => {
    it('should return null for empty data', () => {
      expect(createInitialWindow(0)).toBeNull();
    });

    it('should return full range if data is smaller than default window', () => {
      const window = createInitialWindow(50);
      expect(window).toEqual({ startIndex: 0, endIndex: 49 });
    });

    it('should return partial range if data is larger than default window', () => {
      const window = createInitialWindow(200);
      expect(window).toEqual({ startIndex: 200 - DEFAULT_CHART_WINDOW, endIndex: 199 });
    });
  });

  describe('normalizeWindow', () => {
    it('should clamp values within bounds', () => {
      const window = { startIndex: -10, endIndex: 100 };
      const normalized = normalizeWindow(window, 50);
      expect(normalized).toEqual({ startIndex: 0, endIndex: 49 });
    });

    it('should correct inverted ranges', () => {
      const window = { startIndex: 20, endIndex: 10 };
      // Implementation logic: end = Math.max(start, Math.min(end, len-1))
      // start=20, end=Math.max(20, 10) -> 20. So it becomes a single point.
      const normalized = normalizeWindow(window, 50);
      expect(normalized).toEqual({ startIndex: 20, endIndex: 20 });
    });

    it('should return null for invalid data length', () => {
      expect(normalizeWindow({ startIndex: 0, endIndex: 10 }, 0)).toBeNull();
    });
  });
});
