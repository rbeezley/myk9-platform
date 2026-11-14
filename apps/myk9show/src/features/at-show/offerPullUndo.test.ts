import { describe, expect, it, vi } from 'vitest';
import { showUndoToast } from '@/lib/undoToast';
import { canUndoPull, offerPullUndo, pulledFromLabel } from './offerPullUndo';

vi.mock('@/lib/undoToast', () => ({ showUndoToast: vi.fn() }));

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

describe('offerPullUndo toast text', () => {
  const entry = (over: Record<string, unknown>) =>
    ({
      callName: 'Hazel',
      status: 'no-status',
      className: 'Container Novice A',
      section: 'A',
      ...over,
    }) as never;

  it('names the class and says it moved to Not running', () => {
    offerPullUndo(entry({}), 'replicated', () => undefined);
    expect(showUndoToast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Hazel pulled from Container Novice A',
        description: expect.stringContaining('Not running'),
      })
    );
  });

  it('adds the section when the class name lacks it', () => {
    expect(pulledFromLabel(entry({ className: 'Container Novice' }))).toBe('Container Novice A');
    expect(pulledFromLabel(entry({ className: 'Container Novice A' }))).toBe('Container Novice A');
  });
});
