import { describe, expect, it } from 'vitest';
import { RECOVERABLE_ENTRY_STATUSES } from './cartStore.recovery';

describe('cart recovery entry status gate', () => {
  it('allows a pending superseded money-root entry', () => {
    expect(RECOVERABLE_ENTRY_STATUSES).toContain('moved');
  });
});
