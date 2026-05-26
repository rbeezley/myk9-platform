import { createContext, useContext, type ReactNode } from 'react';

import type { RingsideContextValue } from './types';

/**
 * The Q5 dependency-injection context — see `./types.ts` for the design
 * rationale and the empirical scoping of what crosses this boundary.
 *
 * The default value is `null` (not a stub). Consumers calling
 * `useRingside()` outside a provider get a thrown error, not a silently
 * broken capability bag — easier to diagnose than `undefined.is.not.a.function`.
 */
const RingsideContext = createContext<RingsideContextValue | null>(null);

export interface RingsideProviderProps {
  /**
   * The capability bag the host supplies. Most hosts will compute this
   * from their own `useAuth()` + replication singletons + prefetch cache,
   * memoized to avoid re-rendering ringside subtrees on unrelated state
   * changes.
   */
  value: RingsideContextValue;
  children: ReactNode;
}

/**
 * Host-injected context provider for the ringside experience.
 *
 * Wrap any subtree that mounts ringside pages (ClassList, EntryList,
 * scoresheets, dialogs) in `<RingsideProvider value={...}>`. The value
 * must be referentially stable across renders where the underlying
 * capabilities haven't actually changed — use `useMemo` in the host.
 */
export function RingsideProvider({ value, children }: RingsideProviderProps) {
  return <RingsideContext.Provider value={value}>{children}</RingsideContext.Provider>;
}

/**
 * Read the full capability bag. Prefer the typed sub-hooks
 * (`useRingsideAuth`, `useRingsideReplication`, `useRingsidePrefetch`)
 * when a component only needs one slice — they participate in React's
 * re-render scheduling the same way but make the dependency explicit at
 * the call site.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useRingside(): RingsideContextValue {
  const ctx = useContext(RingsideContext);
  if (ctx === null) {
    throw new Error(
      'useRingside must be used within a <RingsideProvider>. ' +
        'Hosts mount ringside experiences by wrapping the subtree with ' +
        '<RingsideProvider value={...}> — see @myk9/ringside docs.'
    );
  }
  return ctx;
}

/**
 * Typed sub-hooks. Pages should prefer these over `useRingside()` so the
 * dependency they need is visible at the import. (They also make
 * test-time mocking targeted: a component using `useRingsideReplication`
 * doesn't pull auth or prefetch into its mock surface.)
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useRingsideAuth() {
  return useRingside().auth;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRingsideReplication() {
  return useRingside().replication;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRingsidePrefetch() {
  return useRingside().prefetch;
}
