import { toast } from 'sonner';

/**
 * Shared time-boxed undo toast (design.md decision D6).
 *
 * Extracted from the inlined show-map sonner pattern: a success toast carrying a
 * single "Undo" action button. The action label and duration are configurable so
 * every undo-covered surface (show-map scratch, secretary status change) shows
 * one consistent affordance instead of hand-rolling `toast.success(..., { action })`
 * at each call site.
 *
 * `duration` is only forwarded to sonner when provided — omitting it preserves
 * sonner's default toast duration, so migrating an existing call site that relied
 * on the default does not change its behavior.
 */
export interface ShowUndoToastOptions {
  /** Primary toast message, e.g. "Entry marked pulled". */
  message: string;
  /** Invoked when the user clicks the undo action. */
  onUndo: () => void;
  /** Undo action label. Defaults to "Undo". */
  undoLabel?: string;
  /** Auto-dismiss window in ms. Omit to keep sonner's default duration. */
  duration?: number;
  /** Optional secondary line under the message. */
  description?: string;
}

export function showUndoToast({
  message,
  onUndo,
  undoLabel = 'Undo',
  duration,
  description,
}: ShowUndoToastOptions): void {
  toast.success(message, {
    action: { label: undoLabel, onClick: onUndo },
    ...(duration !== undefined ? { duration } : {}),
    ...(description ? { description } : {}),
  });
}
