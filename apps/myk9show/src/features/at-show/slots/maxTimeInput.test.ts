import { describe, it, expect } from 'vitest';
import { parseMaxTimeInput, quickPickTimes } from './maxTimeInput';

describe('parseMaxTimeInput', () => {
  it('reads M:SS, M.SS, packed digits and bare minutes', () => {
    expect(parseMaxTimeInput('4:30')).toBe(270);
    expect(parseMaxTimeInput('4.30')).toBe(270);
    expect(parseMaxTimeInput('430')).toBe(270);
    expect(parseMaxTimeInput('1200')).toBe(720);
    expect(parseMaxTimeInput(' 4 ')).toBe(240);
  });

  it('refuses anything else', () => {
    for (const bad of ['', 'soon', '4:3', '12345', '4:30:00', '-4', '1:99', '1.60', '199']) {
      expect(parseMaxTimeInput(bad)).toBeNull();
    }
  });
});

describe('quickPickTimes (MYK9-1101)', () => {
  it('steps every 30 seconds across the range, from the first step at or above the minimum', () => {
    expect(quickPickTimes(60, 180)).toEqual([60, 90, 120, 150, 180]);
    expect(quickPickTimes(75, 150)).toEqual([90, 120, 150]);
    expect(quickPickTimes(180, 300)).toHaveLength(5);
  });
});
