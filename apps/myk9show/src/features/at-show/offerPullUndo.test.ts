import { describe, expect, it } from 'vitest';
import { canUndoPull } from './offerPullUndo';

describe('canUndoPull', () => {
  it('offers Undo to the staff writer for any prior status', () => {
    expect(canUndoPull('replicated', 'in-ring')).toBe(true);
    expect(canUndoPull(undefined, 'completed')).toBe(true);
  });

  it('offers the exhibitor Undo only for statuses self check-in can restore', () => {
    expect(canUndoPull('self-checkin-rpc', 'checked-in')).toBe(true);
    expect(canUndoPull('self-checkin-rpc', 'no-status')).toBe(true);
    expect(canUndoPull('self-checkin-rpc', 'in-ring')).toBe(false);
    expect(canUndoPull('self-checkin-rpc', 'completed')).toBe(false);
  });
});
