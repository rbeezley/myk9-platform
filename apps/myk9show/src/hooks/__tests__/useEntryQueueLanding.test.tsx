import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, useEffect, type ReactNode } from 'react';
import { MemoryRouter, useLocation, useSearchParams } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { normalizeEntryManagementCockpitParams } from '@/components/entries/management/entryManagementCockpitParams';
import { groupEntriesByShowRegistration } from '@/components/entries/management/showRegistrationProjection';
import { useEntryManagementCockpit } from '../useEntryManagementCockpit';
import { useEntryQueueLanding } from '../useEntryQueueLanding';

function entry(index: number, entryStatus: EntryStatus): EntryManagementEntry {
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
        classId: `class-${index}`,
        name: `Class ${index}`,
        number: `${index}`,
        fee: 25,
        status: 'entered',
      },
    ],
    totalFee: 25,
    paidAmount: 25,
    entryStatus,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date(2026, 6, 1, 9, index),
    lastUpdated: new Date(2026, 6, 1, 9, index),
  };
}

const settled = () =>
  groupEntriesByShowRegistration([entry(1, EntryStatus.ACCEPTED), entry(2, EntryStatus.ACCEPTED)]);
const withPending = () =>
  groupEntriesByShowRegistration([entry(1, EntryStatus.ACCEPTED), entry(2, EntryStatus.PENDING)]);

type Groups = ReturnType<typeof settled>;

/**
 * The page's own shape: the same strip effect that rewrites the URL to its normalized form (and
 * so drops an explicit `queue=needs-review`), declared BEFORE the landing hook, as in
 * EntryManagementPage. Without it a live read of the URL would pass.
 */
function mount(
  initial: string,
  initialProps: { groups: Groups; loaded?: boolean; tab?: boolean; showId?: string }
) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(MemoryRouter, { initialEntries: [initial] }, children);
  return renderHook(
    (props: { groups: Groups; loaded?: boolean; tab?: boolean; showId?: string }) => {
      const [searchParams, setSearchParams] = useSearchParams();
      const location = useLocation();
      const { state, params } = normalizeEntryManagementCockpitParams(searchParams);
      useEffect(() => {
        if (params.toString() !== searchParams.toString())
          setSearchParams(params, { replace: true });
      }, [params, searchParams, setSearchParams]);
      useEntryQueueLanding({
        showId: props.showId ?? 'show-1',
        loaded: props.loaded ?? true,
        onRegistrationsTab: props.tab ?? true,
        groups: props.groups,
        state,
        trialClassIds: undefined,
      });
      const cockpit = useEntryManagementCockpit({ groups: props.groups, state });
      return { search: location.search, cockpit };
    },
    { wrapper, initialProps }
  );
}

describe('useEntryQueueLanding', () => {
  it('lands on All with the forms listed when Needs review is empty', async () => {
    const { result } = mount('/', { groups: settled() });

    await waitFor(() => expect(result.current.cockpit.state.queues).toEqual(['all']));
    expect(result.current.search).toBe('?queue=all');
    expect(result.current.cockpit.page.total).toBe(2);
  });

  it('lands on Needs review when it has items', () => {
    const { result } = mount('/', { groups: withPending() });

    expect(result.current.cockpit.state.queues).toEqual(['needs-review']);
    expect(result.current.search).toBe('');
    expect(result.current.cockpit.page.total).toBe(1);
  });

  it('keeps an explicit queue=needs-review although the page strips it from the URL', async () => {
    // Forms load after the first render, by which time the strip effect has rewritten the URL.
    const { result, rerender } = mount('/?queue=needs-review', {
      groups: settled(),
      loaded: false,
    });
    await waitFor(() => expect(result.current.search).toBe(''));
    rerender({ groups: settled(), loaded: true });

    expect(result.current.cockpit.state.queues).toEqual(['needs-review']);
    expect(result.current.cockpit.page.total).toBe(0);
  });

  it('decides on the scoped view: a class scope with nothing to review lands on All', async () => {
    const { result } = mount('/?class=class-1', { groups: withPending() });

    await waitFor(() => expect(result.current.cockpit.state.queues).toEqual(['all']));
    expect(result.current.cockpit.page.total).toBe(1);
  });

  it('does not land for a search link such as ?person=, and still lists the matches', () => {
    const { result } = mount('/?person=Exhibitor 1', { groups: withPending() });

    expect(result.current.cockpit.state.queues).toEqual(['needs-review']);
    expect(result.current.cockpit.page.total).toBe(1);
  });

  it('waits for the forms to load before deciding', () => {
    const { result } = mount('/', { groups: settled(), loaded: false });

    expect(result.current.search).toBe('');
  });

  it('is not spent by an exception pane: switching to Registrations later still lands', async () => {
    const { result, rerender } = mount('/', { groups: settled(), tab: false });
    expect(result.current.search).toBe('');

    rerender({ groups: settled(), tab: true });
    await waitFor(() => expect(result.current.cockpit.state.queues).toEqual(['all']));
  });

  it('decides once: picking the empty Needs review afterwards is honored', async () => {
    const { result } = mount('/', { groups: settled() });
    await waitFor(() => expect(result.current.cockpit.state.queues).toEqual(['all']));

    act(() => result.current.cockpit.setQueues(['needs-review']));
    await waitFor(() => expect(result.current.cockpit.state.queues).toEqual(['needs-review']));
  });
});
