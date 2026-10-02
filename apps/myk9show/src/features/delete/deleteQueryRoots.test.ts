/**
 * The React Query half of delete and Undo is driven by the same declared table as
 * the local stores (`deleteLocalStores.ts`). MYK9-922 round 8: an entry or dog
 * Undo left `useTrialEntries` (`['trials', id, 'entries']`) stale because the
 * roots were a separate hand-written list. This suite derives every query family
 * that holds entries from the `queryKeys` factories, so a new one fails here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({ restore: vi.fn() }));
vi.mock('./deleteServer', () => ({ softDeleteOnServer: vi.fn(), restoreOnServer: mocks.restore }));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock('./deleteLocalState', () => ({
  reconcileLocalDeletion: vi.fn(),
  reconcileLocalRestore: vi.fn(),
}));

import { queryKeys } from '@/lib/queryClient';
import { LOCAL_STORES_BY_KIND, QUERY_ROOTS_BY_KIND } from './deleteLocalStores';
import { undoDelete } from './deleteUndoToast';
import { invalidateAfterDelete } from './deleteRecords';
import type { DeleteObjectKind } from './deleteTypes';

const KINDS = Object.keys(LOCAL_STORES_BY_KIND) as DeleteObjectKind[];

/** Every query key a `queryKeys` factory can build, called with a dummy argument. */
function allKeys(node: unknown): readonly unknown[][] {
  if (Array.isArray(node)) return [node];
  if (typeof node === 'function') {
    return allKeys((node as (...args: unknown[]) => unknown)('x', 'x', 'x'));
  }
  if (node && typeof node === 'object') return Object.values(node).flatMap(allKeys);
  return [];
}

/** Roots of every factory key that holds entries (names one at a position >= 1, or is rooted at it). */
const ENTRY_HOLDING_ROOTS = [
  ...new Set([
    ...allKeys(queryKeys)
      .filter(key => key.includes('entries'))
      .map(key => String(key[0])),
    // Not a factory: useClassEntries et al. key `['classes', classId, 'entries']` inline.
    'classes',
  ]),
];

describe('query roots per delete kind', () => {
  it('finds the families that hold entries (known-answer control)', () => {
    expect(ENTRY_HOLDING_ROOTS).toEqual(expect.arrayContaining(['entries', 'shows', 'trials']));
  });

  it.each(KINDS.filter(kind => LOCAL_STORES_BY_KIND[kind].includes('entries')))(
    '%s: invalidates every query family that holds entries',
    kind => {
      expect(QUERY_ROOTS_BY_KIND[kind]).toEqual(expect.arrayContaining(ENTRY_HOLDING_ROOTS));
    }
  );

  it.each(['entry', 'dog'] as const)(
    'Undo of a %s refreshes the trial entries query',
    async kind => {
      mocks.restore.mockResolvedValue(undefined);
      const queryClient = new QueryClient();
      const spy = vi.spyOn(queryClient, 'invalidateQueries');
      await undoDelete({
        kind,
        deleted: [{ id: 'x1', name: 'X' }],
        deletedAt: Date.now(),
        queryClient,
      });
      expect(spy).toHaveBeenCalledWith({ queryKey: ['trials'] });
    }
  );

  it('delete and restore both invalidate from the same table', () => {
    for (const kind of KINDS) {
      const queryClient = new QueryClient();
      const spy = vi.spyOn(queryClient, 'invalidateQueries');
      invalidateAfterDelete(queryClient, kind);
      expect(spy.mock.calls.map(call => (call[0] as { queryKey: string[] }).queryKey[0])).toEqual([
        ...QUERY_ROOTS_BY_KIND[kind],
      ]);
    }
  });
});

beforeEach(() => {
  mocks.restore.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});
