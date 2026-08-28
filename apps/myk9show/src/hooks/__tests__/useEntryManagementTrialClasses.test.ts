/**
 * Regression tests for impeccable p3 audit finding A1.
 *
 * `trialClassIds` is used as an ALLOWLIST: the registration queue keeps a group
 * only if one of its entries sits in a class on that list. Defaulting an unread
 * list to `[]` therefore does not mean "no filter" -- it means "match nothing",
 * and the page reported zero registrations, zero queue counts and "No matching
 * registrations" while every entry sat in IndexedDB.
 *
 * That state is not exotic. `useClassesByTrialQuery` declares no `networkMode`,
 * so it inherits React Query's `'online'` default and PAUSES when offline; a
 * paused query reports `isLoading: false` with `data: undefined`, which is
 * indistinguishable from a settled empty result unless the caller checks
 * `isSuccess`. The same collapse happened on an error, and briefly on every
 * normal trial pick.
 *
 * The contract under test: ids are `undefined` unless the read SUCCEEDED, and
 * "a trial is selected but its classes are unknown" is reported as its own
 * state so the UI can say so instead of reporting a zero.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@/test/utils/testUtils';
import { useEntryManagementTrialClasses } from '../useEntryManagementTrialScope';

const queryState = {
  data: undefined as unknown,
  isLoading: false,
  isSuccess: false,
  isError: false,
};

vi.mock('@/hooks/queries/useClassesDatabase', () => ({
  useClassesByTrialQuery: () => ({
    data: queryState.data,
    isLoading: queryState.isLoading,
    isSuccess: queryState.isSuccess,
    isError: queryState.isError,
    refetch: vi.fn(),
  }),
}));

beforeEach(() => {
  queryState.data = undefined;
  queryState.isLoading = false;
  queryState.isSuccess = false;
  queryState.isError = false;
});

describe('useEntryManagementTrialClasses (audit A1)', () => {
  it('reports ids when the class list actually loaded', () => {
    queryState.data = [{ id: 'class-1' }, { id: 'class-2' }];
    queryState.isSuccess = true;

    const { result } = renderHook(() => useEntryManagementTrialClasses('trial-1'));

    expect(result.current.trialClassIds).toEqual(['class-1', 'class-2']);
    expect(result.current.trialClassesUnknown).toBe(false);
  });

  it('reports UNKNOWN, not an empty allowlist, when the query is paused offline', () => {
    // A paused query: not loading, not successful, no data.
    const { result } = renderHook(() => useEntryManagementTrialClasses('trial-1'));

    expect(result.current.trialClassIds).toBeUndefined();
    expect(result.current.trialClassesUnknown).toBe(true);
  });

  it('reports UNKNOWN when the query errored', () => {
    // Distinct from the paused case above: the query settled, and settled in
    // failure. Both must reach the same conclusion by different routes.
    queryState.isError = true;
    queryState.data = undefined;

    const { result } = renderHook(() => useEntryManagementTrialClasses('trial-1'));

    expect(result.current.trialClassIds).toBeUndefined();
    expect(result.current.trialClassesUnknown).toBe(true);
  });

  it('does not call a still-loading trial unknown, so no notice flashes on a normal pick', () => {
    queryState.isLoading = true;

    const { result } = renderHook(() => useEntryManagementTrialClasses('trial-1'));

    expect(result.current.trialClassIds).toBeUndefined();
    expect(result.current.trialClassesUnknown).toBe(false);
  });

  it('distinguishes a trial with genuinely no classes from an unread one', () => {
    queryState.data = [];
    queryState.isSuccess = true;

    const { result } = renderHook(() => useEntryManagementTrialClasses('trial-1'));

    // A successful empty read IS an empty allowlist, and that is correct.
    expect(result.current.trialClassIds).toEqual([]);
    expect(result.current.trialClassesUnknown).toBe(false);
  });

  it('is not unknown when no trial is selected at all', () => {
    const { result } = renderHook(() => useEntryManagementTrialClasses(null));

    expect(result.current.trialClassesUnknown).toBe(false);
  });
});
