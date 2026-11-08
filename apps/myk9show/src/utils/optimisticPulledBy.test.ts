import { describe, expect, it } from 'vitest';
import { optimisticPulledBy } from './optimisticPulledBy';

describe('optimisticPulledBy (MYK9-1757)', () => {
  it('credits a new Pull to staff, never to the earlier flagger', () => {
    expect(optimisticPulledBy('checked-in', 'pulled', 'exhibitor')).toBe('staff');
    expect(optimisticPulledBy('no-status', 'pulled', null)).toBe('staff');
  });

  it('keeps the flagger on a re-Pull and forgets it on leaving pulled', () => {
    expect(optimisticPulledBy('pulled', 'pulled', 'exhibitor')).toBe('exhibitor');
    expect(optimisticPulledBy('pulled', 'checked-in', 'exhibitor')).toBeNull();
  });
});
