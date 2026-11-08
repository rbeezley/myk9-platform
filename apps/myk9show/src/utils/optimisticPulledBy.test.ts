import { describe, expect, it } from 'vitest';
import { optimisticPulledBy } from './optimisticPulledBy';

describe('optimisticPulledBy (MYK9-1757)', () => {
  it('reads a new Pull as unknown, never the earlier flagger', () => {
    expect(optimisticPulledBy('checked-in', 'pulled', 'exhibitor')).toBeNull();
    expect(optimisticPulledBy('no-status', 'pulled', null)).toBeNull();
  });

  it('keeps the flagger on a re-Pull and forgets it on leaving pulled', () => {
    expect(optimisticPulledBy('pulled', 'pulled', 'exhibitor')).toBe('exhibitor');
    expect(optimisticPulledBy('pulled', 'checked-in', 'exhibitor')).toBeNull();
  });
});
