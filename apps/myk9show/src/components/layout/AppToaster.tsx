/**
 * Sonner, docked bottom-right, lifted clear of whatever action bar is mounted.
 *
 * Two defects from the 2026-07-24 exhibitor audit are addressed here, and they
 * are separate problems that happened to combine into one data loss:
 *
 *   1. The toast sat ON the bottom-right primary control, so a tap intended for
 *      "Save Changes" hit the toast instead.
 *   2. The toast was stale — a CTA from an earlier screen was still on-screen
 *      and still clickable, so the mis-hit navigated somewhere unrelated.
 *
 * Fixing only (1) leaves a stale CTA hoverable over live content; fixing only
 * (2) leaves the next toast covering the button. Both are handled below.
 *
 * The bottom-right dock itself stays: `<ToastContainer />` owns the top-right
 * corner and `test/mainToasterDocking.source.test.ts` pins sonner away from it.
 */
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Toaster, toast, useSonner } from 'sonner';
import { useActionBarStore, selectReservedBottom } from '@/store/actionBarStore';

/** Clearance between the toast stack and the action bar beneath it. */
const TOAST_GAP_PX = 12;

/**
 * A toast raised within this window of a navigation is treated as feedback
 * ABOUT that navigation, and survives it.
 *
 * "Dog deleted" is raised and the page navigates away in the same tick;
 * blanket-dismissing on route change swallows the only confirmation the user
 * ever gets. A stale toast from a previous screen is seconds old by the time
 * anything navigates, so age separates the two without asking every call site
 * to opt in.
 */
const NAVIGATION_FEEDBACK_GRACE_MS = 1500;

export function AppToaster() {
  const reservedBottom = useActionBarStore(selectReservedBottom);
  const { pathname } = useLocation();
  const { toasts } = useSonner();
  const firstRender = useRef(true);

  // First time each toast was seen. Sonner exposes no created-at, and toast ids
  // are caller-supplied often enough that they cannot stand in for one.
  // Maintained in an effect, not during render: mutating a ref while rendering
  // is impure and React may discard or replay that render.
  const seenAt = useRef(new Map<string | number, number>());
  useEffect(() => {
    const map = seenAt.current;
    const now = Date.now();
    const liveIds = new Set(toasts.map(t => t.id));
    for (const t of toasts) {
      if (!map.has(t.id)) map.set(t.id, now);
    }
    for (const id of [...map.keys()]) {
      if (!liveIds.has(id)) map.delete(id);
    }
  }, [toasts]);

  useEffect(() => {
    // Don't wipe a toast raised during the initial render of the landing route
    // — this effect runs once on mount before any navigation has happened.
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // A toast describes something that happened on the screen you were on.
    // Once you leave, its CTA points somewhere the message no longer explains,
    // and it is still clickable. Clear those — but spare anything raised as
    // part of this navigation, or "Dog deleted" dies with the page that
    // reported it.
    const cutoff = Date.now() - NAVIGATION_FEEDBACK_GRACE_MS;
    for (const [id, firstSeen] of seenAt.current) {
      if (firstSeen <= cutoff) toast.dismiss(id);
    }
    // `toasts` is deliberately not a dependency: this must fire on navigation,
    // not on every toast change. seenAt is a ref, read at fire time, so the
    // lint rule is satisfied without a suppression.
  }, [pathname]);

  const bottom =
    reservedBottom > 0
      ? `calc(max(1rem, env(safe-area-inset-bottom)) + ${reservedBottom + TOAST_GAP_PX}px)`
      : 'max(1rem, env(safe-area-inset-bottom))';

  const offset = {
    right: 'max(1rem, env(safe-area-inset-right))',
    bottom,
  };

  return (
    <Toaster
      theme="system"
      richColors
      closeButton
      className="myk9-sonner-a11y"
      position="bottom-right"
      offset={offset}
      mobileOffset={offset}
    />
  );
}
