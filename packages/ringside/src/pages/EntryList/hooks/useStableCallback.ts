/**
 * A function with a fixed identity that always calls the latest `fn`.
 *
 * The entry list hands the same handlers to up to 60 memoised cards. The page
 * re-creates some of them on every render (an inline arrow, or a `useCallback`
 * over changing state), which would defeat the card memo, so the list wraps
 * each in one of these (MYK9-1365). The ref is written in a layout effect, so
 * an event handler never runs a callback older than the last commit.
 */

import { useCallback, useLayoutEffect, useRef } from 'react';

export function useStableCallback<Args extends unknown[], Result>(
  fn: (...args: Args) => Result
): (...args: Args) => Result {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: Args) => ref.current(...args), []);
}

/**
 * `useStableCallback` for an optional handler. Presence is part of the
 * contract (a card with no `onOpenDragMode` has no long press), so the stable
 * wrapper is returned only while `fn` is defined.
 */
export function useOptionalStableCallback<Args extends unknown[], Result>(
  fn: ((...args: Args) => Result) | undefined
): ((...args: Args) => Result) | undefined {
  const stable = useStableCallback((...args: Args): Result =>
    (fn as (...a: Args) => Result)(...args)
  );
  return fn ? stable : undefined;
}
