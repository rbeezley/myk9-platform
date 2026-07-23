import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, useEffect, type ReactNode } from 'react';
import { MemoryRouter, useLocation, useSearchParams } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { normalizeEntryManagementCockpitParams } from '@/components/entries/management/entryManagementCockpitParams';
import { groupEntriesByShowRegistration } from '@/components/entries/management/showRegistrationProjection';
import { useEntryManagementCockpit } from '../useEntryManagementCockpit';

function entry(index: number, classId = `class-${index}`): EntryManagementEntry {
  return {
    id: `entry-${index}`,
    registrationId: `registration-${index}`,
    entryNumber: `E-${index}`,
    showId: 'show-1',
    dogId: `dog-${index}`,
    dogName: `Dog ${index}`,
    ownerName: `Exhibitor ${index}`,
    ownerEmail: `exhibitor${index}@example.com`,
    handlerName: `Handler ${index}`,
    classes: [
      {
        id: `entry-${index}`,
        classId,
        name: `Class ${index}`,
        number: `${index}`,
        fee: 25,
        status: 'entered',
      },
    ],
    totalFee: 25,
    paidAmount: 0,
    entryStatus: EntryStatus.PENDING,
    paymentStatus: PaymentStatus.PENDING,
    submittedAt: new Date(2026, 6, 1, 9, index),
    lastUpdated: new Date(2026, 6, 1, 9, index),
  };
}

function LocationProbe({ onSearch }: { onSearch: (search: string) => void }) {
  const location = useLocation();

  useEffect(() => {
    onSearch(location.search);
  }, [location.search, onSearch]);
  return null;
}

function wrapper(initialEntry: string, onSearch: (search: string) => void = () => {}) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      MemoryRouter,
      { initialEntries: [initialEntry] },
      createElement(LocationProbe, { onSearch }),
      children
    );
  };
}

describe('useEntryManagementCockpit', () => {
  it('reads normalized state without competing with the page-owned URL canonicalizer', () => {
    let search = '';
    const groups = groupEntriesByShowRegistration([entry(1)]);
    const { result } = renderHook(
      () => {
        const [searchParams] = useSearchParams();
        return useEntryManagementCockpit({
          groups,
          state: normalizeEntryManagementCockpitParams(searchParams).state,
        });
      },
      {
        wrapper: wrapper('/?view=cards&queue=all', value => {
          search = value;
        }),
      }
    );

    expect(result.current.state.queue).toBe('all');
    expect(search).toBe('?view=cards&queue=all');
  });

  it('resets page and selection when the queue changes while memoizing counts', async () => {
    const entries = Array.from({ length: 55 }, (_, index) => entry(index));
    const groups = groupEntriesByShowRegistration(entries);
    const { result } = renderHook(
      () => {
        const [searchParams] = useSearchParams();
        return useEntryManagementCockpit({
          groups,
          state: normalizeEntryManagementCockpitParams(searchParams).state,
        });
      },
      { wrapper: wrapper('/?queue=all') }
    );

    act(() => result.current.setPageIndex(1));
    expect(result.current.page.pageIndex).toBe(1);
    act(() => result.current.selection.toggleItem(result.current.page.items[0]!));
    expect(result.current.selection.selectedCount).toBe(1);
    const queueCounts = result.current.queueCounts;

    act(() => result.current.setQueue('needs-review'));
    await waitFor(() => {
      expect(result.current.page.pageIndex).toBe(0);
      expect(result.current.selection.selectedCount).toBe(0);
    });
    expect(result.current.queueCounts).toBe(queueCounts);
  });

  it('clears out-of-scope focus and makes search counts whole-show', async () => {
    let search = '';
    const entries = [entry(1, 'class-trial-1'), entry(2, 'class-trial-2')];
    const groups = groupEntriesByShowRegistration(entries);
    const { result } = renderHook(
      () => {
        const [searchParams] = useSearchParams();
        return useEntryManagementCockpit({
          groups,
          state: normalizeEntryManagementCockpitParams(searchParams).state,
          trialClassIds: ['class-trial-1'],
        });
      },
      {
        wrapper: wrapper('/?trial=trial-1&registration=registration-2', value => {
          search = value;
        }),
      }
    );

    await waitFor(() => expect(search).toBe('?trial=trial-1'));
    expect(result.current.queueCounts.all).toBe(1);

    act(() => result.current.setSearch('Dog 2'));
    await waitFor(() => expect(result.current.page.total).toBe(1));
    expect(result.current.queueCounts.all).toBe(2);
  });

  it('preserves focus until registration groups are ready for validation', async () => {
    let search = '';

    renderHook(
      () => {
        const [searchParams] = useSearchParams();
        return useEntryManagementCockpit({
          groups: [],
          state: normalizeEntryManagementCockpitParams(searchParams).state,
          canValidateFocus: false,
        });
      },
      {
        wrapper: wrapper('/?registration=registration-1', value => {
          search = value;
        }),
      }
    );

    await waitFor(() => expect(search).toBe('?registration=registration-1'));
  });
});
