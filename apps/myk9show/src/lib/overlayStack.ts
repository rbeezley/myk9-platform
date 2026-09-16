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

/**
 * Body-scroll lock, owned HERE rather than by each overlay, because the release
 * condition is a property of the STACK and every consumer has to agree on it.
 *
 * `lockedHere` is the ownership half of that: release NOTHING we did not lock.
 * Two reasons it is not optional. React runs an effect's previous cleanup
 * before the next effect body, so on `open: false -> true` the release fires
 * against a still-empty stack -- without the flag that stamps the body on the
 * way IN, on surfaces that never lock at all. And Base UI's modal Dialog sets
 * its own `overflow-x`/`overflow-y` lock, which a bare `overflow` shorthand
 * write would flatten, letting the page scroll behind an open modal.
 *
 * `SlideOverPanel` used to inline `if (openOverlayCount() === 0) …unset` in its
 * own cleanup, which made the lock's lifetime depend on who happened to pop
 * last. React unmounts a parent's children in tree order, so a panel that
 * unmounted with a dialog still registered above it popped itself, saw a
 * non-empty stack, skipped the unset — and the dialog's own cleanup had no
 * body style to restore. `overflow: hidden` then outlived every overlay and the
 * page underneath could not be scrolled again. Routing away from Dog Details
 * with the status dialog open over the Edit panel did exactly that.
 *
 * Only surfaces that actually want the page frozen call `lockBodyScroll`; every
 * consumer calls `releaseBodyScrollIfNoOverlays` on the way out, so whichever
 * one empties the stack performs the release regardless of unmount order.
 */
let lockedHere = false;

export function lockBodyScroll(): void {
  lockedHere = true;
  document.body.style.overflow = 'hidden';
}

/**
 * Restores scrolling once the LAST registered overlay has popped — and only if
 * this module is what locked it.
 *
 * Clears the inline declaration rather than writing `unset`: an inline
 * declaration outranks every author stylesheet, so `unset` would leave a body
 * that permanently overrides any `html`/`body` overflow rule the app later
 * grows. `''` removes ours and lets the cascade decide again.
 */
export function releaseBodyScrollIfNoOverlays(): void {
  if (!lockedHere || openOverlayIds.length > 0) return;
  lockedHere = false;
  document.body.style.overflow = '';
}
