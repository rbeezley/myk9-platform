import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('sonner', () => ({
  toast: { success: vi.fn() },
}));

import { toast } from 'sonner';
import { showUndoToast } from './undoToast';

describe('showUndoToast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  describe('onStood: the change was not undone (MYK9-1800)', () => {
    type Options = {
      action: { onClick: () => void };
      onAutoClose?: () => void;
      onDismiss?: () => void;
    };
    const shown = () => vi.mocked(toast.success).mock.calls[0]?.[1] as unknown as Options;

    it('fires when the toast times out', () => {
      const onStood = vi.fn();
      showUndoToast({ message: 'x', onUndo: vi.fn(), onStood });
      shown().onAutoClose?.();
      expect(onStood).toHaveBeenCalledTimes(1);
    });

    it('fires when she closes the toast herself', () => {
      const onStood = vi.fn();
      showUndoToast({ message: 'x', onUndo: vi.fn(), onStood });
      shown().onDismiss?.();
      expect(onStood).toHaveBeenCalledTimes(1);
    });

    it('fires once even when sonner reports both a dismiss and a close', () => {
      const onStood = vi.fn();
      showUndoToast({ message: 'x', onUndo: vi.fn(), onStood });
      shown().onDismiss?.();
      shown().onAutoClose?.();
      expect(onStood).toHaveBeenCalledTimes(1);
    });

    it('never fires after Undo, even when the toast then closes', () => {
      const onStood = vi.fn();
      const onUndo = vi.fn();
      showUndoToast({ message: 'x', onUndo, onStood });
      shown().action.onClick();
      shown().onDismiss?.();
      shown().onAutoClose?.();
      expect(onUndo).toHaveBeenCalledTimes(1);
      expect(onStood).not.toHaveBeenCalled();
    });

    it('adds no close handlers when nobody is waiting on the outcome', () => {
      showUndoToast({ message: 'x', onUndo: vi.fn() });
      expect('onAutoClose' in shown()).toBe(false);
      expect('onDismiss' in shown()).toBe(false);
    });
  });
});
