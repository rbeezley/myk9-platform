/**
 * URL-backed list state (MYK9-810: every filtered list is a link).
 *
 * `patch` sets or deletes several params in one update and leaves every other
 * param (a tab, an unrelated filter) untouched. `readOneOf` returns the param
 * only when it is a value the control offers, so a stale link falls back to
 * the default instead of silently filtering.
 */
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { patchSearchParams } from '@/components/list-toolkit';

export function useListUrlParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const patch = useCallback(
    (changes: Readonly<Record<string, string | null>>) =>
      patchSearchParams(setSearchParams, changes),
    [setSearchParams]
  );

  const readOneOf = useCallback(
    <T extends string>(key: string, allowed: readonly T[]): T | null => {
      const value = searchParams.get(key);
      return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null;
    },
    [searchParams]
  );

  return { searchParams, patch, readOneOf };
}
