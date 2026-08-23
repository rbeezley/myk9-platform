import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams, type SetURLSearchParams } from 'react-router-dom';
import {
  applyUrlFilters,
  changedFilterKeys,
  hasRedundantFilterParams,
  isDefaultFilterState,
  parseUrlFilters,
  type StringValued,
  type UrlFilterAllowedValues,
} from './urlFilters';
import { useLivePathname } from './useLivePathname';

export interface UseUrlFiltersOptions<T extends StringValued<T>> {
  /**
   * Keys whose URL writes are debounced. Defaults to `['search']` — the only
   * free-text control on the browse pages. Everything else (chips, selects)
   * writes immediately, because one click should be one committed state.
   */
  debouncedKeys?: readonly (keyof T & string)[];
  /** Debounce window for `debouncedKeys`, in ms. */
  debounceMs?: number;
  /**
   * Allow-lists for keys with a closed vocabulary. A URL value outside its list
   * falls back to the default instead of being trusted. Omit data-derived keys
   * (breed, club, role) and free text.
   */
  allowedValues?: UrlFilterAllowedValues<T>;
}

const DEFAULT_DEBOUNCED_KEYS: readonly string[] = ['search'];
const DEFAULT_DEBOUNCE_MS = 300;

/**
 * URL-synced filter state for the browse pages (MYK9-221).
 *
 * A drop-in replacement for `useState<TFilters>(INITIAL_FILTERS)`: it returns
 * the same `[values, setValues]` pair with the same `Dispatch<SetStateAction>`
 * signature, so the four `useBrowse*Data` hooks swap one line and every call
 * site above them is unchanged.
 *
 * Behaviour:
 * - **The URL is the source of truth.** State is seeded from the query string
 *   on mount, so a refresh, a back-navigation, or a link pasted to a colleague
 *   restores the same result set.
 * - **No second source of truth.** The rendered value is `fromUrl` with a small
 *   overlay of the keys the user has touched but whose debounced write has not
 *   landed yet. Because the overlay is per-key rather than a whole snapshot, a
 *   filter changed by a *concurrent* navigation (a `?club=` deep link) is still
 *   read from the URL rather than overwritten by stale state.
 * - **Writes use `{ replace: true }`.** Typing a six-letter search must not
 *   bury the back button under six history entries.
 * - **Unrelated params are preserved.** Only keys present in `defaults` are
 *   written or deleted, so `?add=true`, `?tab=`, and `?view=` survive.
 * - **A pending write never follows the user off the page** — see the pathname
 *   guard in the timer callback.
 *
 * `defaults` and `options` are pinned on first render — pass a module-level
 * constant, exactly as the `INITIAL_FILTERS` these hooks already use.
 */
export function useUrlFilters<T extends StringValued<T>>(
  defaults: T,
  options: UseUrlFiltersOptions<T> = {}
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [searchParams, setSearchParams] = useSearchParams();
  const { pathname } = useLocation();
  // Live, not commit-lagged — see useLivePathname for why that distinction matters.
  const getLivePathname = useLivePathname(pathname);

  // Pinned via the lazy `useState` initializer rather than a ref, so nothing is
  // read from a ref during render: a caller that rebuilds its options object on
  // every render still cannot change which keys this hook owns mid-life.
  const [config] = useState(() => ({
    defaults,
    debouncedKeys: (options.debouncedKeys ?? DEFAULT_DEBOUNCED_KEYS) as readonly string[],
    debounceMs: options.debounceMs ?? DEFAULT_DEBOUNCE_MS,
    allowedValues: options.allowedValues,
  }));

  const fromUrl = useMemo(
    () => parseUrlFilters(searchParams, config.defaults, config.allowedValues),
    [searchParams, config]
  );

  // `pending` is an OVERLAY of the keys touched since the last committed write,
  // not a whole snapshot. Everything else keeps coming from the URL, so a
  // concurrent navigation that changes a different filter key is respected.
  const [pending, setPending] = useState<Partial<T> | null>(null);
  const values = useMemo(
    () => (pending ? ({ ...fromUrl, ...pending } as T) : fromUrl),
    [fromUrl, pending]
  );

  // Mirrors `values` so the setter can compose two calls made in the same tick.
  // Synced from an effect (never written during render) and read only from
  // event handlers.
  const valuesRef = useRef<T>(values);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Keys touched since the last committed write. */
  const dirtyRef = useRef<Set<string>>(new Set());
  /** The route a pending write was scheduled on. */
  const scheduledPathRef = useRef<string>(pathname);
  /**
   * The query string we last wrote, held until React hands it back.
   *
   * Two writes in the same tick both read `routerRef`, which React has not
   * refreshed in between — without this the second would fold onto params from
   * before the first and delete the key it had just set.
   */
  const lastWrittenRef = useRef<URLSearchParams | null>(null);

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  // react-router's `setSearchParams` closes over the params of the render that
  // created it — its functional form receives that snapshot, NOT the live query
  // string (react-router 7.18.2, `useSearchParams`). A write must therefore fold
  // onto params read at COMMIT time, or a `?tab=` written by `useUrlTab` during
  // the debounce window is silently dropped.
  //
  // Synced in a LAYOUT effect: it runs during commit rather than after paint,
  // which is the freshest the router location can be made without reaching into
  // react-router internals.
  const routerRef = useRef<{
    params: URLSearchParams;
    setParams: SetURLSearchParams;
    pathname: string;
  }>({ params: searchParams, setParams: setSearchParams, pathname });

  useLayoutEffect(() => {
    routerRef.current = { params: searchParams, setParams: setSearchParams, pathname };
    // React has caught up, so the optimistic base is no longer needed.
    lastWrittenRef.current = null;
  }, [searchParams, setSearchParams, pathname]);

  const clearPendingWrite = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /**
   * Commit an overlay of dirty keys onto the CURRENT query string.
   *
   * Re-reading the live params and overriding only the touched keys is what
   * keeps a write from clobbering a filter that changed underneath it — writing
   * the whole schedule-time snapshot would delete a `?club=` that a sidebar
   * deep link set 200ms ago.
   */
  const commitWrite = useCallback(
    (overlay: Partial<T>) => {
      const { setParams } = routerRef.current;
      const params = lastWrittenRef.current ?? routerRef.current.params;
      const current = parseUrlFilters(params, config.defaults, config.allowedValues);
      const merged = { ...current, ...overlay } as T;
      const nextParams = applyUrlFilters(params, merged, config.defaults);
      lastWrittenRef.current = nextParams;
      setParams(nextParams, { replace: true });
    },
    [config]
  );

  const setFilters = useCallback<React.Dispatch<React.SetStateAction<T>>>(
    update => {
      const prev = valuesRef.current;
      const next = typeof update === 'function' ? (update as (p: T) => T)(prev) : update;
      const changed = changedFilterKeys(next, prev, config.defaults);
      if (changed.length === 0) return;

      for (const key of changed) dirtyRef.current.add(key);
      valuesRef.current = next;
      clearPendingWrite();

      const overlay: Partial<T> = {};
      for (const key of dirtyRef.current) overlay[key as keyof T] = next[key as keyof T];

      // Clearing every filter is a committed action, not typing — it must not
      // sit behind the debounce just because `search` happened to be the only
      // difference. "One click, one committed state."
      const isReset = isDefaultFilterState(next, config.defaults);

      if (!isReset && changed.every(key => config.debouncedKeys.includes(key))) {
        setPending(overlay);
        scheduledPathRef.current = getLivePathname();
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          // A pending write must never follow the user onto another route. Every
          // browse page is lazy-loaded and react-router commits navigation inside
          // `startTransition`, so this callback can fire while the outgoing page
          // is still mounted but the location has already moved. Without this
          // guard, typing `max` on /dogs and clicking Shows within the window
          // lands you on `/shows?search=max` — filtered to nothing, unexplained.
          if (getLivePathname() !== scheduledPathRef.current) {
            setPending(null);
            dirtyRef.current.clear();
            return;
          }
          // Cleared in the same batch as the write, so the handover from the
          // local draft to the URL never renders an intermediate value.
          setPending(null);
          commitWrite(overlay);
          dirtyRef.current.clear();
        }, config.debounceMs);
        return;
      }

      // A chip click commits immediately — and carries every dirty key, so it
      // also flushes whatever search text was still sitting in the overlay.
      setPending(null);
      commitWrite(overlay);
      dirtyRef.current.clear();
    },
    [clearPendingWrite, commitWrite, config, getLivePathname]
  );

  useEffect(() => clearPendingWrite, [clearPendingWrite]);

  // A param that parses back to its own default (`?breed=all`, `?search=`, or a
  // value its allow-list rejects) can never be cleared by a normal write: it
  // produces no diff, so nothing ever writes and it lingers in every link the
  // user shares. Normalize it away once, on arrival.
  const normalizedRef = useRef(false);
  useEffect(() => {
    if (normalizedRef.current) return;
    normalizedRef.current = true;
    if (!hasRedundantFilterParams(searchParams, config.defaults, config.allowedValues)) return;
    const { params, setParams } = routerRef.current;
    setParams(
      applyUrlFilters(
        params,
        parseUrlFilters(params, config.defaults, config.allowedValues),
        config.defaults
      ),
      { replace: true }
    );
  }, [config, searchParams]);

  return [values, setFilters];
}
