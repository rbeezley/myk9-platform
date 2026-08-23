import { useCallback, useContext, useLayoutEffect, useRef } from 'react';
import { UNSAFE_DataRouterContext, UNSAFE_NavigationContext } from 'react-router-dom';

interface MaybeHistoryNavigator {
  location?: { pathname?: string };
}

/**
 * Read the router's pathname **as of right now**, not as of the last committed
 * render.
 *
 * `useLocation()` is React state, so it only updates when React commits. That
 * is a problem for anything scheduled on a timer: react-router 7 wraps
 * navigation state updates in `React.startTransition`
 * (`react-router@7.18.2`, `Router` → `setState`), so the router's own location
 * — the one a relative `navigate('?x=1')` resolves against — moves *before* the
 * commit that would tell a component it has moved. A callback firing in that
 * window sees a stale `useLocation()` and writes onto a route the user has
 * already left.
 *
 * Both escape hatches are read defensively and independently:
 * - `RouterProvider` (production): `router.state.location` is live; its
 *   `navigator` carries no `location` at all.
 * - `BrowserRouter` / `MemoryRouter` (tests): the `navigator` *is* the history
 *   object, whose `location` is live.
 *
 * If react-router ever changes both shapes, this degrades to the committed
 * pathname passed in — the pre-existing behaviour — rather than throwing.
 */
export function useLivePathname(committedPathname: string): () => string {
  const dataRouter = useContext(UNSAFE_DataRouterContext);
  const navigation = useContext(UNSAFE_NavigationContext);

  const committedRef = useRef(committedPathname);
  useLayoutEffect(() => {
    committedRef.current = committedPathname;
  }, [committedPathname]);

  return useCallback(() => {
    const fromDataRouter = dataRouter?.router?.state?.location?.pathname;
    if (typeof fromDataRouter === 'string') return fromDataRouter;

    const navigator = navigation?.navigator as MaybeHistoryNavigator | undefined;
    const fromHistory = navigator?.location?.pathname;
    if (typeof fromHistory === 'string') return fromHistory;

    return committedRef.current;
  }, [dataRouter, navigation]);
}
