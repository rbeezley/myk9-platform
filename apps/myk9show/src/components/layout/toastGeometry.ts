/**
 * Where the sonner stack sits at the bottom of the viewport, shared by `AppToaster` (which
 * lifts it) and `useReserveBottomAbove` (which decides how far it ever needs lifting).
 */

/** Clearance between the toast stack and the action bar beneath it. */
export const TOAST_GAP_PX = 12;

/** Sonner's `GAP` between expanded toasts (sonner 2.0.8, `dist/index.mjs`). */
const SONNER_STACK_GAP_PX = 14;
/** Sonner's `VISIBLE_TOASTS_AMOUNT`: the most toasts drawn at once. */
const SONNER_VISIBLE_TOASTS = 3;
/** Resting `bottom` offset in `AppToaster` (`max(1rem, safe-area)`), 1rem at 16px. */
const TOAST_BASE_OFFSET_PX = 16;
/**
 * A one-or-two-line toast: 16px padding top and bottom, 1px border, up to two 13px lines.
 * Sonner measures real heights at runtime and exposes none, so this is the grounded estimate.
 */
const TOAST_HEIGHT_PX = 72;

/**
 * Height of the strip at the viewport bottom that a fully expanded, unlifted stack can occupy.
 * Content whose top is inside it can be covered; content above it cannot, so a lift never has
 * to exceed it and the stack stays on screen.
 */
export const TOAST_ZONE_PX =
  TOAST_BASE_OFFSET_PX +
  SONNER_VISIBLE_TOASTS * TOAST_HEIGHT_PX +
  (SONNER_VISIBLE_TOASTS - 1) * SONNER_STACK_GAP_PX;
