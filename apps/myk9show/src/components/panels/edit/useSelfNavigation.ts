import { useCallback, useRef } from 'react';

/**
 * While the returned counter is above zero the route guard stands down: the
 * panel is navigating on its own behalf, and the user already answered for those
 * changes in the panel's own prompt. Without it, closing a panel whose parent
 * drops a `?add=true` param produces a second "Leave this page?" prompt for
 * changes just discarded (MYK9-165).
 *
 * The counter is raised around the navigating CALL only — never across an
 * await — so a slow save leaves the form guarded the whole time it is in
 * flight. A ref rather than state because nothing can re-render between a
 * click handler and the navigation it dispatches in the same tick.
 */
export function useSelfNavigation() {
  const selfNavigationRef = useRef(0);
  const runSelfNavigation = useCallback((navigate: () => void) => {
    selfNavigationRef.current += 1;
    try {
      navigate();
    } finally {
      selfNavigationRef.current -= 1;
    }
  }, []);
  return { selfNavigationRef, runSelfNavigation };
}
