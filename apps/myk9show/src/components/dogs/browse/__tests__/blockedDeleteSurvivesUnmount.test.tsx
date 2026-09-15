/**
 * MYK9-584 regression: the blocked-delete report must survive the bulk bar
 * disappearing.
 *
 * The production bug: the optimistic delete removed the dogs from the list,
 * `useBulkSelection({ pruneToItems: true })` dropped them from the selection
 * during render, `BrowseDogsPage` stopped rendering `DogsBulkActionsBar`, and
 * the dialog — which lived inside that bar — was unmounted before it could
 * show. Combined with the toast suppression, the user got nothing at all.
 *
 * This models the ownership rule directly: the state lives in a hook the PAGE
 * owns, so a consumer unmounting cannot take the report with it.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';

const forceDeleteMutateAsync = vi.fn().mockResolvedValue(undefined);

vi.mock('@/hooks/queries/useDogsDatabase', () => ({
  useForceDeleteDogMutation: () => ({
    mutateAsync: (...a: unknown[]) => forceDeleteMutateAsync(...a),
  }),
}));

import { useBlockedDogDeletes } from '../useBlockedDogDeletes';
import { BlockedDogDeleteDialog } from '../BlockedDogDeleteDialog';
import type { Dog } from '@/types/dog-types';

function dog(id: string): Dog {
  return {
    id,
    name: `Dog ${id}`,
    callName: `Dog ${id}`,
    breed: 'Border Collie',
    sex: 'male',
    ownerId: 'owner-1',
    status: 'active',
  } as Dog;
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

describe('useBlockedDogDeletes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('holds the blocked dogs reported to it', () => {
    const { result } = renderHook(() => useBlockedDogDeletes(), { wrapper });

    act(() => result.current.reportBlocked([dog('a'), dog('b')]));

    expect(result.current.blockedDogs.map(d => d.id)).toEqual(['a', 'b']);
  });

  // This test previously asserted the OPPOSITE — that a second report REPLACES
  // the first. That shipped a P1: `useBulkDispatch` retries only the UNCLAIMED
  // subset, so a retry's blocked set is disjoint from what is already shown.
  // Replacing dropped the earlier dogs from the dialog while they were also
  // absent from the toast's detail lines, leaving them reported NOWHERE — the
  // exact silence MYK9-584 exists to prevent, one level up.
  it('accumulates across reports so an earlier batch is never dropped', () => {
    const { result } = renderHook(() => useBlockedDogDeletes(), { wrapper });

    act(() => result.current.reportBlocked([dog('a'), dog('b')]));
    act(() => result.current.reportBlocked([dog('c')]));

    expect(result.current.blockedDogs.map(d => d.id)).toEqual(['a', 'b', 'c']);
  });

  it('de-duplicates by id, so re-reporting the same dog does not list it twice', () => {
    const { result } = renderHook(() => useBlockedDogDeletes(), { wrapper });

    act(() => result.current.reportBlocked([dog('a'), dog('b')]));
    act(() => result.current.reportBlocked([dog('b'), dog('c')]));

    expect(result.current.blockedDogs.map(d => d.id)).toEqual(['a', 'b', 'c']);
  });

  it('clears on dismiss', () => {
    const { result } = renderHook(() => useBlockedDogDeletes(), { wrapper });
    act(() => result.current.reportBlocked([dog('a')]));
    act(() => result.current.dismiss());
    expect(result.current.blockedDogs).toEqual([]);
  });
});

/**
 * The structural guarantee, exercised end to end: a child that reports blocked
 * dogs and is then unmounted (exactly what selection pruning does to the bulk
 * bar) must not take the dialog with it.
 */
describe('blocked-delete report survives the reporting child unmounting', () => {
  function Harness() {
    const blocked = useBlockedDogDeletes();
    const [showChild, setShowChild] = useState(true);

    return React.createElement(
      React.Fragment,
      null,
      showChild
        ? React.createElement(
            'button',
            {
              type: 'button',
              onClick: () => {
                // Report, then vanish — the ordering the bug depended on.
                blocked.reportBlocked([dog('a'), dog('b')]);
                setShowChild(false);
              },
            },
            'report and unmount'
          )
        : null,
      blocked.blockedDogs.length > 0
        ? React.createElement(BlockedDogDeleteDialog, {
            dogs: blocked.blockedDogs,
            open: true,
            onClose: blocked.dismiss,
            onForceDelete: blocked.forceDelete,
            canForceDelete: true,
          })
        : null
    );
  }

  it('still shows the dialog naming every blocked dog', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(React.createElement(QueryClientProvider, { client }, React.createElement(Harness)));

    await act(async () => {
      screen.getByRole('button', { name: /report and unmount/i }).click();
    });

    // The reporter is gone...
    expect(screen.queryByRole('button', { name: /report and unmount/i })).not.toBeInTheDocument();
    // ...and the report is still on screen.
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Dog a')).toBeInTheDocument();
    expect(screen.getByText('Dog b')).toBeInTheDocument();
  });
});
