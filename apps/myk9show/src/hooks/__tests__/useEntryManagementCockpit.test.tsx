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

    expect(result.current.state.queues).toEqual(['all']);
    expect(search).toBe('?view=cards&queue=all');
  });

  it('decides the default once per scope: arrivals and load errors never flip it', () => {
    const accepted = (index: number) => ({
      ...entry(index, 'class-a'),
      entryStatus: EntryStatus.ACCEPTED,
    });
    const settledGroups = groupEntriesByShowRegistration([accepted(1), accepted(2)]);
    const arrivedGroups = groupEntriesByShowRegistration([
      accepted(1),
      accepted(2),
      entry(3, 'class-b'),
    ]);
    let search = '';
    const { result, rerender } = renderHook(
      ({ groups, canValidateFocus }) => {
        const [searchParams, setSearchParams] = useSearchParams();
        return {
          cockpit: useEntryManagementCockpit({
            groups,
            canValidateFocus,
            state: normalizeEntryManagementCockpitParams(searchParams).state,
          }),
          setSearchParams,
        };
      },
      {
        initialProps: { groups: settledGroups, canValidateFocus: true },
        wrapper: wrapper('/?registration=registration-1', value => {
          search = value;
        }),
      }
    );
    expect(result.current.cockpit.state.queues).toEqual(['all']);
    act(() => result.current.cockpit.selection.selectItems(settledGroups.slice(1, 2)));

    // A pending form arrives: the view, the open form and the ticked row stay put; the count rises.
    rerender({ groups: arrivedGroups, canValidateFocus: true });
    expect(result.current.cockpit.state.queues).toEqual(['all']);
    expect(result.current.cockpit.queueCounts['needs-review']).toBe(1);

    // A refresh fails and recovers: still All, still open, still ticked.
    rerender({ groups: arrivedGroups, canValidateFocus: false });
    rerender({ groups: arrivedGroups, canValidateFocus: true });
    expect(result.current.cockpit.state.queues).toEqual(['all']);
    expect(result.current.cockpit.state.registrationKey).toBe('registration-1');
    expect(result.current.cockpit.selection.selectedIds.size).toBe(1);
    expect(search).toBe('?registration=registration-1');

    // A new scope decides afresh: class-b holds only the pending form.
    act(() => result.current.setSearchParams(new URLSearchParams('class=class-b')));
    expect(result.current.cockpit.state.queues).toEqual(['needs-review']);
  });

  it('waits for the trial classes before deciding, and decides afresh for another show', () => {
    const accepted = (index: number, classId: string, showId = 'show-1') => ({
      ...entry(index, classId),
      showId,
      entryStatus: EntryStatus.ACCEPTED,
    });
    const showOne = groupEntriesByShowRegistration([accepted(1, 'class-a'), entry(2, 'class-b')]);
    const { result, rerender } = renderHook(
      ({ groups, trialClassIds }) => {
        const [searchParams] = useSearchParams();
        return useEntryManagementCockpit({
          groups,
          trialClassIds,
          state: normalizeEntryManagementCockpitParams(searchParams).state,
        });
      },
      {
        initialProps: {
          groups: showOne,
          trialClassIds: undefined as readonly string[] | undefined,
        },
        wrapper: wrapper('/?trial=trial-a'),
      }
    );
    // The trial's classes are unknown: the whole show has a pending form, but no landing yet.
    rerender({ groups: showOne, trialClassIds: ['class-a'] });
    expect(result.current.state.queues).toEqual(['all']);

    // Another show's forms replace these: its own landing, Needs review for its pending form.
    const showTwo = groupEntriesByShowRegistration([{ ...entry(3, 'class-a'), showId: 'show-2' }]);
    rerender({ groups: showTwo, trialClassIds: ['class-a'] });
    expect(result.current.state.queues).toEqual(['needs-review']);
  });

  it('does not hold the pre-load placeholder: a deep link to an accepted form stays open', () => {
    const accepted = (index: number) => ({ ...entry(index), entryStatus: EntryStatus.ACCEPTED });
    let search = '';
    const { result, rerender } = renderHook(
      ({ groups, canValidateFocus }) => {
        const [searchParams] = useSearchParams();
        return useEntryManagementCockpit({
          groups,
          canValidateFocus,
          state: normalizeEntryManagementCockpitParams(searchParams).state,
        });
      },
      {
        initialProps: {
          groups: [] as ReturnType<typeof groupEntriesByShowRegistration>,
          canValidateFocus: false,
        },
        wrapper: wrapper('/?registration=registration-1', value => {
          search = value;
        }),
      }
    );
    rerender({
      groups: groupEntriesByShowRegistration([accepted(1), accepted(2)]),
      canValidateFocus: true,
    });

    expect(result.current.state.queues).toEqual(['all']);
    expect(result.current.state.registrationKey).toBe('registration-1');
    expect(search).toBe('?registration=registration-1');
  });

  it('keeps the selection when the queue changes during a search, which lists matches regardless', () => {
    const groups = groupEntriesByShowRegistration([entry(1), entry(2)]);
    const { result } = renderHook(
      () => {
        const [searchParams, setSearchParams] = useSearchParams();
        return {
          cockpit: useEntryManagementCockpit({
            groups,
            state: normalizeEntryManagementCockpitParams(searchParams).state,
          }),
          setSearchParams,
        };
      },
      { wrapper: wrapper('/?search=Dog') }
    );
    act(() => result.current.cockpit.selection.selectItems(groups.slice(0, 1)));
    act(() => result.current.setSearchParams(new URLSearchParams('search=Dog&queue=all')));

    expect(result.current.cockpit.state.queues).toEqual(['all']);
    expect(result.current.cockpit.selection.selectedIds.size).toBe(1);
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

    act(() => result.current.setQueues(['needs-review']));
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

  it('counts checked queues as distinct forms, never their sum, and writes scope in one step', async () => {
    let search = '';
    // Form 1 holds an entry that needs review AND an accepted one with payment due, so it is in
    // both queues; form 2 only needs review; form 3 only has payment due.
    const accepted = (
      index: number,
      classId: string,
      registrationId = `registration-${index}`
    ) => ({
      ...entry(index, classId),
      registrationId,
      entryStatus: EntryStatus.ACCEPTED,
    });
    const groups = groupEntriesByShowRegistration([
      entry(1, 'c1'),
      accepted(4, 'c1', 'registration-1'),
      entry(2, 'c2'),
      accepted(3, 'c2'),
    ]);
    const { result } = renderHook(
      () => {
        const [searchParams] = useSearchParams();
        return useEntryManagementCockpit({
          groups,
          state: normalizeEntryManagementCockpitParams(searchParams).state,
        });
      },
      {
        wrapper: wrapper('/?queue=needs-review,payment-due', value => {
          search = value;
        }),
      }
    );

    expect(result.current.queueCounts['needs-review']).toBe(2);
    expect(result.current.queueCounts['payment-due']).toBe(2);
    expect(result.current.queueSelectionCount).toBe(3);

    act(() => result.current.setScope(['t1'], ['c2']));
    await waitFor(() => expect(result.current.page.total).toBe(2));
    expect(result.current.queueSelectionCount).toBe(2);
    expect(new URLSearchParams(search).get('trial')).toBe('t1');
    expect(new URLSearchParams(search).get('class')).toBe('c2');

    act(() => result.current.setQueues(['payment-due']));
    await waitFor(() => expect(result.current.state.queues).toEqual(['payment-due']));
  });
});
