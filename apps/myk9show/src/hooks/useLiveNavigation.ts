import { useCallback, useContext, useLayoutEffect, useRef } from 'react';
import {
  UNSAFE_DataRouterContext,
  UNSAFE_NavigationContext,
  useLocation,
  useNavigationType,
} from 'react-router-dom';

/** Where the router is right now, and how it got there. */
export interface LiveNavigation {
  pathname: string;
  /** Distinguishes two visits to the same path — a same-route Back changes it. */
  key: string;
  /** 'POP' means Back/Forward; 'PUSH'/'REPLACE' mean a link or a programmatic write. */
  action: string;
}

interface MaybeHistoryNavigator {
  location?: { pathname?: string; key?: string };
  action?: string;
}

/**
 * Read the router's position **as of right now**, not as of the last committed
 * render.
 *
 * `useLocation()` is React state, so it only updates when React commits. That is
 * a problem for anything scheduled on a timer: react-router 7 wraps navigation
 * state updates in `React.startTransition` — for the production path that is
 * `RouterProvider`'s `setState` (`react-router@7.18.2`,
 * `chunk-62JRHF6Z.mjs:6752`); `MemoryRouter` (`:6976`), `BrowserRouter`
 * (`:10411`) and `HashRouter` do the same. So the router's location — the one a
 * relative `navigate('?x=1')` resolves against — moves *before* the commit that
 * would tell a component it has moved. A callback firing in that window sees a
 * stale `useLocation()` and writes onto a route the user has already left.
 *
 * Both escape hatches are read defensively and independently:
 * - `RouterProvider` (production): `router.state` is live; its `navigator`
 *   carries no `location` at all.
 * - `BrowserRouter` / `MemoryRouter` (tests): the `navigator` *is* the history
 *   object, whose `location` and `action` are live.
 *
 * If react-router ever changes both shapes, this degrades to the committed
 * values — the pre-existing behaviour — rather than throwing.
 */
export function useLiveNavigation(): () => LiveNavigation {
  const dataRouter = useContext(UNSAFE_DataRouterContext);
  const navigation = useContext(UNSAFE_NavigationContext);
  const location = useLocation();
  const navigationType = useNavigationType();

  const committedRef = useRef<LiveNavigation>({
    pathname: location.pathname,
    key: location.key,
    action: navigationType,
  });
  useLayoutEffect(() => {
    committedRef.current = {
      pathname: location.pathname,
      key: location.key,
      action: navigationType,
    };
  }, [location.pathname, location.key, navigationType]);

  return useCallback(() => {
    const state = dataRouter?.router?.state;
    if (state?.location && typeof state.location.pathname === 'string') {
      return {
        pathname: state.location.pathname,
        key: state.location.key ?? '',
        action: state.historyAction ?? committedRef.current.action,
      };
    }

    const navigator = navigation?.navigator as MaybeHistoryNavigator | undefined;
    if (navigator?.location && typeof navigator.location.pathname === 'string') {
      return {
        pathname: navigator.location.pathname,
        key: navigator.location.key ?? '',
        action: navigator.action ?? committedRef.current.action,
      };
    }

    return committedRef.current;
  }, [dataRouter, navigation]);
}
