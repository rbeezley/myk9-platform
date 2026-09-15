/**
 * Module-level stack of ids for every currently-open modal overlay —
 * `SlideOverPanel` and `CommonDialog` instances alike — in open order, so
 * Escape closes only the topmost surface no matter which primitive is on top
 * (MYK9-523). Before this module existed, `SlideOverPanel` kept its own
 * private `openPanelIds` array and `CommonDialog` had no Escape handling (and
 * no stack membership) at all, so a `CommonDialog` opened over a panel was
 * never "topmost" and Escape fell through to close the panel behind it.
 *
 * Each overlay instance holds one stable `symbol` id (created once via
 * `useRef`) and pushes/pops it around its own `open` prop — see
 * `SlideOverPanel` and `CommonDialog` for the reference usage.
 */
let openOverlayIds: symbol[] = [];

/** Registers `id` as newly opened, at the top of the stack. */
export function pushOpenOverlay(id: symbol): void {
  openOverlayIds.push(id);
}

/** Removes `id` from the stack, wherever it sits. Safe to call more than once. */
export function popOpenOverlay(id: symbol): void {
  openOverlayIds = openOverlayIds.filter(openId => openId !== id);
}

/** True when `id` is the last-pushed (topmost) overlay still open. */
export function isTopmostOverlay(id: symbol): boolean {
  return openOverlayIds.length > 0 && openOverlayIds[openOverlayIds.length - 1] === id;
}

/** Number of overlays currently registered as open. */
export function openOverlayCount(): number {
  return openOverlayIds.length;
}
