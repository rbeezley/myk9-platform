import { describe, it, expect } from 'vitest';
import { maxTimeLabel } from './maxTimeLabel';

describe('maxTimeLabel', () => {
  it('formats a set limit as M:SS', () => {
    expect(maxTimeLabel(180)).toBe('3:00');
    expect(maxTimeLabel(150)).toBe('2:30');
  });

  it('says "Not set" for a class without a limit, never 0:00', () => {
    expect(maxTimeLabel(0)).toBe('Not set');
  });
});
