import { describe, it, expect } from 'vitest';
import { parseMaxTimeInput } from './maxTimeInput';

describe('parseMaxTimeInput', () => {
  it('reads M:SS, M.SS, packed digits and bare minutes', () => {
    expect(parseMaxTimeInput('4:30')).toBe(270);
    expect(parseMaxTimeInput('4.30')).toBe(270);
    expect(parseMaxTimeInput('430')).toBe(270);
    expect(parseMaxTimeInput('1200')).toBe(720);
    expect(parseMaxTimeInput(' 4 ')).toBe(240);
  });

  it('refuses anything else', () => {
    for (const bad of ['', 'soon', '4:3', '12345', '4:30:00', '-4']) {
      expect(parseMaxTimeInput(bad)).toBeNull();
    }
  });
});
