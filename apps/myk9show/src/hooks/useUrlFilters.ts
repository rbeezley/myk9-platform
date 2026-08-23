import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, type SetURLSearchParams } from 'react-router-dom';
import {
  applyUrlFilters,
  changedFilterKeys,
  parseUrlFilters,
  type StringValued,
} from './urlFilters';

export interface UseUrlFiltersOptions<T extends StringValued<T>> {
  /**
   * Keys whose URL writes are debounced. Defaults to `['search']` — the only
   * free-text control on the browse pages. Everything else (chips, selects)
   * writes immediately, because one click should be one committed state.
   */
  debouncedKeys?: readonly (keyof T & string)[];
  /** Debounce window for `debouncedKeys`, in ms. */
  debounceMs?: number;
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
 * - **No second source of truth.** The rendered value is `pending ?? fromUrl`.
 *   `pending` exists only for the few hundred ms between a keystroke and its
 *   debounced write, and is cleared in the same batch as that write — so there
 *   is nothing to adopt back, and nothing that can drift out of sync.
 * - **Writes use `{ replace: true }`.** Typing a six-letter search must not
 *   bury the back button under six history entries.
 * - **Unrelated params are preserved.** Only keys present in `defaults` are
 *   written or deleted, so `?add=true` (the Add Dog / Add Person panel) and
 *   `?tab=` / `?view=` on Shows survive every filter change.
 *
 * `defaults` and `options` are pinned on first render — pass a module-level
 * constant, exactly as the `INITIAL_FILTERS` these hooks already use.
 */
export function useUrlFilters<T extends StringValued<T>>(
  defaults: T,
  options: UseUrlFiltersOptions<T> = {}
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [searchParams, setSearchParams] = useSearchParams();

  // Pinned via the lazy `useState` initializer rather than a ref, so nothing is
  // read from a ref during render: a caller that rebuilds its options object on
  // every render still cannot change which keys this hook owns mid-life.
  const [config] = useState(() => ({
    defaults,
    debouncedKeys: (options.debouncedKeys ?? DEFAULT_DEBOUNCED_KEYS) as readonly string[],
    debounceMs: options.debounceMs ?? DEFAULT_DEBOUNCE_MS,
  }));

  const fromUrl = useMemo(
    () => parseUrlFilters(searchParams, config.defaults),
    [searchParams, config]
  );

  // The only local state is the not-yet-written half of a debounced edit. The
  // rendered value is DERIVED (`pending ?? fromUrl`) rather than mirrored, so
  // there is no second source of truth to drift and no adopt-from-URL effect:
  // once a write lands, `pending` clears in the same batch and the URL takes
  // over, and an external navigation with nothing pending is simply read.
  const [pending, setPending] = useState<T | null>(null);
  const values = pending ?? fromUrl;

  // Mirrors `values` so the setter can compose two calls made in the same tick.
  // Synced from an effect (never written during render) and read only from
  // event handlers.
  const valuesRef = useRef<T>(values);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  // react-router's `setSearchParams` closes over the params from the render it
  // was created in — its functional form receives that snapshot, NOT the live
  // query string (react-router 7.18.2, `useSearchParams`). A debounced write
  // therefore has to fold onto params read at FIRE time, or a `?tab=` written
  // by `useUrlTab` during the debounce window is silently dropped.
  const routerRef = useRef<{ params: URLSearchParams; setParams: SetURLSearchParams }>({
    params: searchParams,
    setParams: setSearchParams,
  });

  useEffect(() => {
    routerRef.current = { params: searchParams, setParams: setSearchParams };
  }, [searchParams, setSearchParams]);

  const clearPendingWrite = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const writeToUrl = useCallback(
    (next: T) => {
      const { params, setParams } = routerRef.current;
      setParams(applyUrlFilters(params, next, config.defaults), { replace: true });
    },
    [config]
  );

  const setFilters = useCallback<React.Dispatch<React.SetStateAction<T>>>(
    update => {
      const prev = valuesRef.current;
      const next = typeof update === 'function' ? (update as (p: T) => T)(prev) : update;
      const changed = changedFilterKeys(next, prev, config.defaults);
      if (changed.length === 0) return;

      valuesRef.current = next;
      clearPendingWrite();

      if (changed.every(key => config.debouncedKeys.includes(key))) {
        setPending(next);
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          // Cleared in the same batch as the write, so the handover from the
          // local draft to the URL never renders an intermediate value.
          setPending(null);
          writeToUrl(next);
        }, config.debounceMs);
        return;
      }

      // A chip click commits immediately — and writes the WHOLE filter set, so
      // it also flushes whatever search text was still sitting in `pending`.
      setPending(null);
      writeToUrl(next);
    },
    [clearPendingWrite, config, writeToUrl]
  );

  useEffect(() => clearPendingWrite, [clearPendingWrite]);

  return [values, setFilters];
}
