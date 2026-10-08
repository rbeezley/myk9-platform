/**
 * `trialClassIds` is an ALLOWLIST: the registration queue keeps a group only if one of its
 * entries sits in a class on that list. Defaulting an unread list to `[]` therefore does not mean
 * "no filter" -- it means "match nothing", and the page reported zero registrations, zero queue
 * counts and "No matching registrations" while every entry sat in IndexedDB (audit A1).
 *
 * That state is not exotic: these reads declare no `networkMode`, so they PAUSE offline, and a
 * paused query reports `isLoading: false` with no data, indistinguishable from a settled empty
 * result unless the caller checks success. The same collapse happens on an error.
 *
 * The contract under test, now with several trials (docs/plan-entries-filter-button.md, settled
 * rules 3 and 10): ids are `undefined` unless EVERY selected trial's read succeeded, and the
 * class field offers every class in the show until a trial is picked.
 */

import { createElement, type ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';
import { useEntryManagementTrialClasses } from '../useEntryManagementTrialScope';

const { getClassesByTrialId } = vi.hoisted(() => ({ getClassesByTrialId: vi.fn() }));
vi.mock('@/services/database/classes', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getClassesByTrialId,
}));

const CLASSES: Record<string, { id: string; name: string }[]> = {
  t1: [{ id: 'c1', name: 'Novice A' }],
  t2: [{ id: 'c2', name: 'Novice B' }],
};

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: createTestQueryClient() }, children);
}

type Input = Parameters<typeof useEntryManagementTrialClasses>[0];

function render(input: Partial<Input>) {
  const props: Input = {
    showTrialIds: ['t1', 't2'],
    trialsLoaded: true,
    selectedTrialIds: [],
    ...input,
  };
  return renderHook(() => useEntryManagementTrialClasses(props), { wrapper });
}

beforeEach(() => {
  getClassesByTrialId.mockReset();
  getClassesByTrialId.mockImplementation(async (trialId: string) => ({
    data: CLASSES[trialId] ?? [],
    error: null,
  }));
});

describe('useEntryManagementTrialClasses', () => {
  it('offers every class in the show, each with its trial, before a trial is picked', async () => {
    const { result } = render({});

    await waitFor(() => expect(result.current.classesLoaded).toBe(true));
    expect(result.current.trialClasses).toEqual([
      { id: 'c1', trialId: 't1', name: 'Novice A' },
      { id: 'c2', trialId: 't2', name: 'Novice B' },
    ]);
    expect(result.current.knownClassIds).toEqual(new Set(['c1', 'c2']));
    expect(result.current.trialClassIds).toBeUndefined();
    expect(result.current.trialClassesUnknown).toBe(false);
  });

  it('offers and scopes to the union of the picked trials once every one has loaded', async () => {
    const { result } = render({ selectedTrialIds: ['t1', 't2'] });

    await waitFor(() => expect(result.current.trialClassIds).toEqual(['c1', 'c2']));
    expect(result.current.classTrialById.get('c2')).toBe('t2');
  });

  it('reports UNKNOWN, not an empty allowlist, when one picked trial could not be read', async () => {
    getClassesByTrialId.mockImplementation(async (trialId: string) =>
      trialId === 't2'
        ? { data: null, error: new Error('offline') }
        : { data: CLASSES[trialId], error: null }
    );
    const { result } = render({ selectedTrialIds: ['t1', 't2'] });

    await waitFor(() => expect(result.current.trialClassesUnknown).toBe(true));
    expect(result.current.trialClassIds).toBeUndefined();
    expect(result.current.classesLoaded).toBe(false);
    expect(result.current.knownClassIds).toBeUndefined();
  });

  it('does not call a still-loading trial unknown, so no notice flashes on a normal pick', () => {
    getClassesByTrialId.mockImplementation(() => new Promise(() => {}));
    const { result } = render({ selectedTrialIds: ['t1'] });

    expect(result.current.isLoadingClasses).toBe(true);
    expect(result.current.trialClassIds).toBeUndefined();
    expect(result.current.trialClassesUnknown).toBe(false);
  });

  it('distinguishes a trial with genuinely no classes from an unread one', async () => {
    const { result } = render({ selectedTrialIds: ['t-empty'] });

    // A successful empty read IS an empty allowlist, and that is correct.
    await waitFor(() => expect(result.current.trialClassIds).toEqual([]));
    expect(result.current.trialClassesUnknown).toBe(false);
  });

  it('reads a linked trial before the trial list arrives, but offers no classes as loaded', async () => {
    const { result } = render({ showTrialIds: [], trialsLoaded: false, selectedTrialIds: ['t1'] });

    await waitFor(() => expect(result.current.trialClassIds).toEqual(['c1']));
    expect(result.current.knownClassIds).toBeUndefined();

    const unpicked = render({ showTrialIds: [], trialsLoaded: false });
    expect(unpicked.result.current.classesLoaded).toBe(false);
  });
});
