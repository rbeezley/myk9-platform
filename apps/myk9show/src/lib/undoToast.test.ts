import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('sonner', () => ({
  toast: { success: vi.fn() },
}));

import { toast } from 'sonner';
import { showUndoToast } from './undoToast';

describe('showUndoToast', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders an Undo action that invokes onUndo', () => {
    const onUndo = vi.fn();
    showUndoToast({ message: 'Entry marked pulled', onUndo });

    const [message, options] = vi.mocked(toast.success).mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ];
    expect(message).toBe('Entry marked pulled');
    expect(options.action.label).toBe('Undo');
    options.action.onClick();
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('omits duration by default so sonner keeps its default window', () => {
    showUndoToast({ message: 'x', onUndo: vi.fn() });
    const options = vi.mocked(toast.success).mock.calls[0]?.[1] as Record<string, unknown>;
    expect('duration' in options).toBe(false);
  });

  it('forwards an explicit duration (time-boxed window) when provided', () => {
    showUndoToast({ message: 'x', onUndo: vi.fn(), duration: 8000 });
    const options = vi.mocked(toast.success).mock.calls[0]?.[1] as { duration?: number };
    expect(options.duration).toBe(8000);
  });

  it('supports a custom undo label', () => {
    showUndoToast({ message: 'x', onUndo: vi.fn(), undoLabel: 'Revert' });
    const options = vi.mocked(toast.success).mock.calls[0]?.[1] as {
      action: { label: string };
    };
    expect(options.action.label).toBe('Revert');
  });
});
