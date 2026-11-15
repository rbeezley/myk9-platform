import { toast } from 'sonner';

/** How long every day-of Undo is offered before it closes itself (owner decision, MYK9-2062). */
export const STATUS_UNDO_WINDOW_MS = 8000;

/**
 * Shared time-boxed undo toast (design.md decision D6).
 *
 * Extracted from the inlined show-map sonner pattern: a success toast carrying a
 * single "Undo" action button. The action label and duration are configurable so
 * every undo-covered surface (show-map scratch, secretary status change) shows
 * one consistent affordance instead of hand-rolling `toast.success(..., { action })`
 * at each call site.
 *
 * `duration` defaults to `STATUS_UNDO_WINDOW_MS`, so no day-of Undo ever falls back to
 * sonner's own default. Only a non-day-of caller (the delete toast) passes its own.
 */
export interface ShowUndoToastOptions {
  /** Primary toast message, e.g. "Entry marked pulled". */
  message: string;
  /** Invoked when the user clicks the undo action. */
  onUndo: () => void;
  /** Undo action label. Defaults to "Undo". */
  undoLabel?: string;
  /** Auto-dismiss window in ms. Defaults to `STATUS_UNDO_WINDOW_MS`. */
  duration?: number;
  /** Optional secondary line under the message. */
  description?: string;
  /**
   * Called once when the toast goes away WITHOUT Undo having been pressed: it timed out, was
   * closed, or was dismissed by a page change. This is the moment the action can no longer
   * be taken back, on the toast's own clock (which pauses while she hovers over it or the
   * tab is hidden), so work that must not outrun Undo hangs off this, never a separate timer.
   */
  onStood?: (() => void) | undefined;
}

export function showUndoToast({
  message,
  onUndo,
  undoLabel = 'Undo',
  duration = STATUS_UNDO_WINDOW_MS,
  description,
  onStood,
}: ShowUndoToastOptions): void {
  // Sonner calls neither close callback for an action click, but the flag makes "Undo was
  // pressed" explicit rather than a property of the library's internals.
  let settled = false;
  const stood = () => {
    if (settled) return;
    settled = true;
    onStood?.();
  };
  toast.success(message, {
    action: {
      label: undoLabel,
      onClick: () => {
        settled = true;
        onUndo();
      },
    },
    duration,
    ...(description ? { description } : {}),
    ...(onStood ? { onAutoClose: stood, onDismiss: stood } : {}),
  });
}
