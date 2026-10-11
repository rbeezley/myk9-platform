import { describe, it, expect } from 'vitest';
import { maxTimeLabel, timerLimitLine } from './maxTimeLabel';

describe('maxTimeLabel', () => {
  it('formats a set limit as M:SS', () => {
    expect(maxTimeLabel(180)).toBe('3:00');
    expect(maxTimeLabel(150)).toBe('2:30');
  });

  it('says "Not set" for a class without a limit, never 0:00', () => {
    expect(maxTimeLabel(0)).toBe('Not set');
  });
});

describe('timerLimitLine', () => {
  it('shows the max before the clock starts and the remaining time while it runs', () => {
    expect(timerLimitLine(0, 180, '3:00.00')).toBe('Max Time: 3:00');
    expect(timerLimitLine(5000, 180, '2:55.00')).toBe('Remaining: 2:55.00');
  });

  it('with no limit, never shows a remaining time', () => {
    expect(timerLimitLine(0, 0, '')).toBe('Max Time: Not set');
    expect(timerLimitLine(5000, 0, '0:00.00')).toBe('Max Time: Not set');
  });
});
