import { describe, expect, it } from 'vitest';
import { formatRingLabel } from './ringLabel';

describe('formatRingLabel', () => {
  it.each([null, undefined, 0, '', '   ', '0', 'Ring 0', 'ring null', 'Ring Unknown'])(
    'returns null for missing ring value %s',
    value => {
      expect(formatRingLabel(value)).toBeNull();
    }
  );

  it('formats positive numeric ring values', () => {
    expect(formatRingLabel(2)).toBe('Ring 2');
  });

  it('formats numeric strings', () => {
    expect(formatRingLabel('2')).toBe('Ring 2');
  });

  it('keeps already formatted ring labels', () => {
    expect(formatRingLabel(' Ring 2 ')).toBe('Ring 2');
  });

  it('keeps named ring areas that are already user-facing', () => {
    expect(formatRingLabel('South Building')).toBe('South Building');
  });
});
