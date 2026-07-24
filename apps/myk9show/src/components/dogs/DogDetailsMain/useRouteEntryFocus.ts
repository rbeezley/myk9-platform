import { useEffect, useRef, type RefObject } from 'react';
import { useNavigationType, type NavigationType } from 'react-router-dom';

/**
 * True when the current navigation is a fresh route entry (PUSH or REPLACE)
 * rather than a browser Back/Forward POP.
 *
 * Route-entry focus/scroll (task 3.8, design.md Decision 10) must run only
 * for the former — a POP is the browser restoring its own saved scroll
 * position on the page being returned to, and must never be fought.
 */
export function isRouteEntryNavigation(navigationType: NavigationType): boolean {
  return navigationType !== 'POP';
}

/**
 * Moves keyboard/AT focus to `headingRef`'s element — and scrolls the
 * window to the top — exactly once per new dog route entry (a dog-card
 * click or a Career/Records deep link), never on browser Back/Forward.
 *
 * `entryKey` identifies the route entry (the dog id): DogDetailPage does not
 * remount when navigating between two dogs on the same `/dogs/:id` route
 * element, so mount-only (`useEffect(..., [])`) would miss that case. Keying
 * off `entryKey` instead makes every new dog its own "entry" regardless of
 * whether the surrounding component tree remounted.
 *
 * Deliberately does not fire again when only `section`/`view` search params
 * change while already on the same dog — that is in-page tab navigation,
 * not route entry, and the content is already visible/in place.
 */
export function useRouteEntryFocus(
  headingRef: RefObject<HTMLElement | null>,
  entryKey: string
): void {
  const navigationType = useNavigationType();
  const prevEntryKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const isNewEntry = prevEntryKeyRef.current !== entryKey;
    prevEntryKeyRef.current = entryKey;
    if (!isNewEntry) return;
    if (!isRouteEntryNavigation(navigationType)) return;

    // Explicit scroll-to-top first so the heading (and the secondary view
    // rendered below it) is visible even if the browser preserved a prior
    // in-app scroll offset; `preventScroll` on focus then avoids a second,
    // possibly conflicting scroll from the focus call itself.
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    headingRef.current?.focus({ preventScroll: true });
  }, [entryKey, navigationType, headingRef]);
}
