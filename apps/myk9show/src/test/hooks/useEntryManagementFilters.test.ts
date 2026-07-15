import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { createElement, useEffect, type ReactNode } from 'react';
import { useEntryManagementFilters } from '@/hooks/useEntryManagementFilters';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';

const emptyTabCounts = { all: 0, pending: 0, accepted: 0, waitlist: 0, issues: 0 };

function LocationProbe({ onSearch }: { onSearch?: (search: string) => void }) {
  const location = useLocation();

  useEffect(() => {
    onSearch?.(location.search);
  }, [location.search, onSearch]);

  return null;
}

function createWrapper(initialEntry = '/', onSearch?: (search: string) => void) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      MemoryRouter,
      { initialEntries: [initialEntry] },
      createElement(LocationProbe, { onSearch }),
      children
    );
  };
}

function makeEntry(overrides: Partial<EntryManagementEntry> = {}): EntryManagementEntry {
  return {
    id: 'entry-1',
    registrationId: 'reg-1',
    entryNumber: 'E001',
    showId: 'show-1',
    dogId: 'dog-1',
    dogName: 'Rex',
    ownerName: 'John Doe',
    ownerEmail: 'john@example.com',
    handlerName: 'John Doe',
    classes: [],
    totalFee: 50,
    paidAmount: 50,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date(),
    lastUpdated: new Date(),
    ...overrides,
  } as EntryManagementEntry;
}

describe('useEntryManagementFilters — trial/class filters', () => {
  it('initializes selectedTab from entryTab=pending and filters to pending entries', () => {
    const entries = [
      makeEntry({ id: 'pending-entry', entryStatus: EntryStatus.PENDING }),
      makeEntry({ id: 'accepted-entry', entryStatus: EntryStatus.ACCEPTED }),
    ] as EntryManagementEntry[];
    const tabCounts = { all: 2, pending: 1, accepted: 1, waitlist: 0, issues: 0 };

    const { result } = renderHook(() => useEntryManagementFilters({ entries, tabCounts }), {
      wrapper: createWrapper('/?entryTab=pending'),
    });

    expect(result.current.selectedTab).toBe('pending');
    expect(result.current.filteredEntries.map(entry => entry.id)).toEqual(['pending-entry']);
  });

  it('falls back to all when entryTab is unsupported', () => {
    const entries = [
      makeEntry({ id: 'pending-entry', entryStatus: EntryStatus.PENDING }),
      makeEntry({ id: 'accepted-entry', entryStatus: EntryStatus.ACCEPTED }),
    ] as EntryManagementEntry[];
    const tabCounts = { all: 2, pending: 1, accepted: 1, waitlist: 0, issues: 0 };

    const { result } = renderHook(() => useEntryManagementFilters({ entries, tabCounts }), {
      wrapper: createWrapper('/?entryTab=unknown'),
    });

    expect(result.current.selectedTab).toBe('all');
    expect(result.current.filteredEntries.map(entry => entry.id)).toEqual([
      'pending-entry',
      'accepted-entry',
    ]);
  });

  it('initializes search from the roster person deep-link param', () => {
    const entries = [
      makeEntry({ id: 'alice-entry', ownerName: 'Alice Martin', dogName: 'Poppy' }),
      makeEntry({ id: 'bob-entry', ownerName: 'Bob Chen', dogName: 'Cedar' }),
    ];

    const { result } = renderHook(
      () => useEntryManagementFilters({ entries, tabCounts: emptyTabCounts }),
      {
        wrapper: createWrapper('/?person=Alice%20Martin'),
      }
    );

    expect(result.current.searchTerm).toBe('Alice Martin');
    expect(result.current.filteredEntries.map(entry => entry.id)).toEqual(['alice-entry']);
  });

  it('matches handler names from the roster person deep-link param', () => {
    const entries = [
      makeEntry({ id: 'handler-entry', ownerName: 'Alice Owner', handlerName: 'Casey Handler' }),
      makeEntry({ id: 'other-entry', ownerName: 'Bob Owner', handlerName: 'Bob Handler' }),
    ];

    const { result } = renderHook(
      () => useEntryManagementFilters({ entries, tabCounts: emptyTabCounts }),
      {
        wrapper: createWrapper('/?person=Casey%20Handler'),
      }
    );

    expect(result.current.searchTerm).toBe('Casey Handler');
    expect(result.current.filteredEntries.map(entry => entry.id)).toEqual(['handler-entry']);
  });

  it('setSelectedTab updates selectedTab and syncs attention to the URL', () => {
    let latestSearch = '';
    const { result } = renderHook(
      () => useEntryManagementFilters({ entries: [], tabCounts: emptyTabCounts }),
      { wrapper: createWrapper('/', search => (latestSearch = search)) }
    );

    act(() => {
      result.current.setSelectedTab('accepted');
    });

    expect(result.current.selectedTab).toBe('accepted');
    const params = new URLSearchParams(latestSearch);
    expect(params.get('attention')).toBe('accepted');
    expect(params.get('entryTab')).toBeNull();
  });

  // move-ups / pulled are no longer attention filters (Phase C moved them to the
  // dedicated Exceptions tab), so setSelectedTab no longer accepts them. The
  // legacy-URL migration onto `?tab=exceptions&queue=…` is covered by
  // entryManagementFilters.test.ts.

  it('setSelectedTab("all") removes legacy tab params and preserves unrelated params', () => {
    let latestSearch = '';
    const { result } = renderHook(
      () => useEntryManagementFilters({ entries: [], tabCounts: emptyTabCounts }),
      {
        wrapper: createWrapper('/?entryTab=pending&tab=waitlist&trial=trial-1', search => {
          latestSearch = search;
        }),
      }
    );

    expect(result.current.selectedTab).toBe('pending');

    act(() => {
      result.current.setSelectedTab('all');
    });

    const params = new URLSearchParams(latestSearch);
    expect(result.current.selectedTab).toBe('all');
    expect(params.get('attention')).toBeNull();
    expect(params.get('entryTab')).toBeNull();
    // ?tab= is owned by the page-level tab system, not the filter hook — it stays
    expect(params.get('tab')).toBe('waitlist');
    expect(params.get('trial')).toBe('trial-1');
  });

  it('setWorkMode("day-of") applies the day-of table preset', () => {
    let latestSearch = '';
    const { result } = renderHook(
      () => useEntryManagementFilters({ entries: [], tabCounts: emptyTabCounts }),
      {
        wrapper: createWrapper('/?attention=pending&view=cards', search => {
          latestSearch = search;
        }),
      }
    );

    act(() => {
      result.current.setPaymentFilter('pending');
    });

    act(() => {
      result.current.setWorkMode('day-of');
    });

    const params = new URLSearchParams(latestSearch);
    expect(result.current.workMode).toBe('day-of');
    expect(result.current.selectedTab).toBe('accepted');
    expect(result.current.paymentFilter).toBe('all');
    expect(result.current.entryViewMode).toBe('table');
    expect(params.get('mode')).toBe('day-of');
    expect(params.get('attention')).toBe('accepted');
    expect(params.get('view')).toBeNull();
  });

  it('setWorkMode("review") applies the review table preset and clears legacy tab params', () => {
    let latestSearch = '';
    const { result } = renderHook(
      () => useEntryManagementFilters({ entries: [], tabCounts: emptyTabCounts }),
      {
        wrapper: createWrapper('/?mode=day-of&attention=accepted&entryTab=accepted', search => {
          latestSearch = search;
        }),
      }
    );

    act(() => {
      result.current.setWorkMode('review');
    });

    const params = new URLSearchParams(latestSearch);
    expect(result.current.workMode).toBe('review');
    expect(result.current.selectedTab).toBe('pending');
    expect(params.get('mode')).toBeNull();
    expect(params.get('attention')).toBe('pending');
    expect(params.get('entryTab')).toBeNull();
  });

  it('initializes trialFilter and classFilter as null', () => {
    const { result } = renderHook(
      () => useEntryManagementFilters({ entries: [], tabCounts: emptyTabCounts }),
      { wrapper: createWrapper() }
    );

    expect(result.current.trialFilter).toBeNull();
    expect(result.current.classFilter).toBeNull();
  });

  it('derives viewMode "registration" when no trial/class filter', () => {
    const { result } = renderHook(
      () => useEntryManagementFilters({ entries: [], tabCounts: emptyTabCounts }),
      { wrapper: createWrapper() }
    );

    expect(result.current.viewMode).toBe('registration');
  });

  it('stays in registration when a trial is selected without the roster toggle (Phase D)', () => {
    const { result } = renderHook(
      () => useEntryManagementFilters({ entries: [], tabCounts: emptyTabCounts }),
      { wrapper: createWrapper('/?trial=trial-1') }
    );

    // Selecting a trial no longer silently morphs the page into a roster.
    expect(result.current.viewMode).toBe('registration');
    expect(result.current.rosterView).toBe(false);
  });

  it('derives viewMode "roster" only with an explicit ?roster=1 toggle on a trial', () => {
    const { result } = renderHook(
      () => useEntryManagementFilters({ entries: [], tabCounts: emptyTabCounts }),
      { wrapper: createWrapper('/?trial=trial-1&roster=1') }
    );

    expect(result.current.viewMode).toBe('roster');
    expect(result.current.rosterView).toBe(true);
  });

  it('never derives a "scoring" view — selecting a class stays in registration (Phase D)', () => {
    const { result } = renderHook(
      () => useEntryManagementFilters({ entries: [], tabCounts: emptyTabCounts }),
      { wrapper: createWrapper('/?trial=trial-1&class=class-1') }
    );

    // Scoring is a deep-link out now, not a view of this page.
    expect(result.current.viewMode).toBe('registration');
  });

  it('setRosterView toggles the roster param and view mode', () => {
    let latestSearch = '';
    const { result } = renderHook(
      () => useEntryManagementFilters({ entries: [], tabCounts: emptyTabCounts }),
      { wrapper: createWrapper('/?trial=trial-1', search => (latestSearch = search)) }
    );

    act(() => result.current.setRosterView(true));
    expect(result.current.viewMode).toBe('roster');
    expect(new URLSearchParams(latestSearch).get('roster')).toBe('1');

    act(() => result.current.setRosterView(false));
    expect(result.current.viewMode).toBe('registration');
    expect(new URLSearchParams(latestSearch).has('roster')).toBe(false);
  });

  it('drops the roster toggle when the trial is cleared', () => {
    let latestSearch = '';
    const { result } = renderHook(
      () => useEntryManagementFilters({ entries: [], tabCounts: emptyTabCounts }),
      { wrapper: createWrapper('/?trial=trial-1&roster=1', search => (latestSearch = search)) }
    );

    act(() => result.current.setTrialFilter(null));

    expect(result.current.viewMode).toBe('registration');
    expect(new URLSearchParams(latestSearch).has('roster')).toBe(false);
  });

  it('filters the entry list in place by class, and by trial when class ids are supplied', () => {
    const klass = (entryId: string, classId: string) =>
      ({ id: entryId, classId }) as EntryManagementEntry['classes'][number];
    const entries = [
      makeEntry({ id: 'in-class', classes: [klass('entry-class-row-1', 'class-1')] }),
      makeEntry({ id: 'other-class', classes: [klass('entry-class-row-2', 'class-2')] }),
    ] as EntryManagementEntry[];
    const tabCounts = { all: 2, pending: 0, accepted: 2, waitlist: 0, issues: 0 };

    // Class filter matches an entry's class directly (no trial class set needed).
    const byClass = renderHook(() => useEntryManagementFilters({ entries, tabCounts }), {
      wrapper: createWrapper('/?class=class-1'),
    });
    expect(byClass.result.current.filteredEntries.map(e => e.id)).toEqual(['in-class']);

    // Trial filter narrows to entries whose class is in the trial's class set.
    const byTrial = renderHook(
      () => useEntryManagementFilters({ entries, tabCounts, trialClassIds: ['class-2'] }),
      { wrapper: createWrapper('/?trial=trial-1') }
    );
    expect(byTrial.result.current.filteredEntries.map(e => e.id)).toEqual(['other-class']);
  });

  it('clears classFilter when trialFilter changes', () => {
    const { result } = renderHook(
      () => useEntryManagementFilters({ entries: [], tabCounts: emptyTabCounts }),
      { wrapper: createWrapper('/?trial=trial-1&class=class-1') }
    );

    expect(result.current.classFilter).toBe('class-1');

    act(() => {
      result.current.setTrialFilter('trial-2');
    });

    expect(result.current.trialFilter).toBe('trial-2');
    expect(result.current.classFilter).toBeNull();
  });

  it('clears both filters when trialFilter is set to null', () => {
    const { result } = renderHook(
      () => useEntryManagementFilters({ entries: [], tabCounts: emptyTabCounts }),
      { wrapper: createWrapper('/?trial=trial-1&class=class-1') }
    );

    act(() => {
      result.current.setTrialFilter(null);
    });

    expect(result.current.trialFilter).toBeNull();
    expect(result.current.classFilter).toBeNull();
  });

  it('tab status filter and payment filter stack together when trial filter is active', () => {
    const entries = [
      makeEntry({
        id: '1',
        entryStatus: EntryStatus.ACCEPTED,
        paymentStatus: PaymentStatus.PAID_ONLINE,
      }),
      makeEntry({
        id: '2',
        entryStatus: EntryStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
      }),
      makeEntry({
        id: '3',
        entryStatus: EntryStatus.ACCEPTED,
        paymentStatus: PaymentStatus.PENDING,
      }),
    ] as EntryManagementEntry[];

    const tabCounts = { all: 3, pending: 1, accepted: 2, waitlist: 0, issues: 0 };

    // Status now comes from the tab (entryTab=accepted), not a dropdown.
    const { result } = renderHook(() => useEntryManagementFilters({ entries, tabCounts }), {
      wrapper: createWrapper('/?trial=trial-1&entryTab=accepted'),
    });

    // Accepted tab narrows to the two accepted entries.
    expect(result.current.filteredEntries.length).toBe(2);

    // Payment filter stacks on top of the tab filter.
    act(() => {
      result.current.setPaymentFilter(PaymentStatus.PENDING);
    });

    expect(result.current.filteredEntries.length).toBe(1);
    expect(result.current.filteredEntries[0].id).toBe('3');
  });

  it('uses enrollment payment status when applying the payment filter', () => {
    const entries = [
      makeEntry({
        id: 'dog-a-entry',
        registrationId: 'enrollment-1',
        paymentStatus: PaymentStatus.PENDING,
        enrollmentPaymentStatus: PaymentStatus.PAID_BY_CHECK,
      }),
      makeEntry({
        id: 'dog-b-entry',
        registrationId: 'enrollment-1',
        paymentStatus: PaymentStatus.PENDING,
        enrollmentPaymentStatus: PaymentStatus.PAID_BY_CHECK,
      }),
      makeEntry({
        id: 'unpaid-entry',
        registrationId: 'enrollment-2',
        paymentStatus: PaymentStatus.PENDING,
      }),
    ] as EntryManagementEntry[];

    const { result } = renderHook(
      () => useEntryManagementFilters({ entries, tabCounts: emptyTabCounts }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.setPaymentFilter(PaymentStatus.PAID_BY_CHECK);
    });

    expect(result.current.filteredEntries.map(entry => entry.id)).toEqual([
      'dog-a-entry',
      'dog-b-entry',
    ]);
  });

  it('initializes and updates the payment filter from URL state', () => {
    let latestSearch = '';
    const { result } = renderHook(
      () => useEntryManagementFilters({ entries: [], tabCounts: emptyTabCounts }),
      {
        wrapper: createWrapper(
          '/?trial=trial-1&class=class-1&payment=pending',
          search => (latestSearch = search)
        ),
      }
    );

    expect(result.current.paymentFilter).toBe(PaymentStatus.PENDING);

    act(() => result.current.setPaymentFilter('all'));

    const params = new URLSearchParams(latestSearch);
    expect(result.current.paymentFilter).toBe('all');
    expect(params.get('payment')).toBeNull();
    expect(params.get('trial')).toBe('trial-1');
    expect(params.get('class')).toBe('class-1');
  });

  it('does not flag accepted entries as issues when the enrollment is paid', () => {
    const entries = [
      makeEntry({
        id: 'paid-enrollment-entry',
        entryStatus: EntryStatus.ACCEPTED,
        paymentStatus: PaymentStatus.PENDING,
        enrollmentPaymentStatus: PaymentStatus.PAID_BY_CHECK,
      }),
      makeEntry({
        id: 'unpaid-entry',
        entryStatus: EntryStatus.ACCEPTED,
        paymentStatus: PaymentStatus.PENDING,
      }),
    ] as EntryManagementEntry[];

    const { result } = renderHook(
      () => useEntryManagementFilters({ entries, tabCounts: emptyTabCounts }),
      {
        wrapper: createWrapper('/?attention=issues'),
      }
    );

    expect(result.current.filteredEntries.map(entry => entry.id)).toEqual(['unpaid-entry']);
  });

  it('clears trial and class filters when showId changes', () => {
    const { result, rerender } = renderHook(
      ({ showId }) => useEntryManagementFilters({ entries: [], tabCounts: emptyTabCounts, showId }),
      {
        wrapper: createWrapper('/?trial=trial-1&class=class-1'),
        initialProps: { showId: 'show-1' },
      }
    );

    expect(result.current.trialFilter).toBe('trial-1');

    rerender({ showId: 'show-2' });

    expect(result.current.trialFilter).toBeNull();
    expect(result.current.classFilter).toBeNull();
  });

  it('setClassFilter sets classFilter and syncs to URL', () => {
    const { result } = renderHook(
      () => useEntryManagementFilters({ entries: [], tabCounts: emptyTabCounts }),
      { wrapper: createWrapper() }
    );

    act(() => result.current.setTrialFilter('trial-1'));
    act(() => result.current.setClassFilter('class-1'));

    expect(result.current.classFilter).toBe('class-1');
    // Phase D: a class selection filters in place; it no longer enters scoring.
    expect(result.current.viewMode).toBe('registration');
  });

  it('setClassFilter(null) removes class but preserves trial', () => {
    const { result } = renderHook(
      () => useEntryManagementFilters({ entries: [], tabCounts: emptyTabCounts }),
      { wrapper: createWrapper('/?trial=trial-1&class=class-1') }
    );

    expect(result.current.classFilter).toBe('class-1');
    expect(result.current.trialFilter).toBe('trial-1');

    act(() => result.current.setClassFilter(null));

    expect(result.current.classFilter).toBeNull();
    expect(result.current.trialFilter).toBe('trial-1');
    // Without an explicit roster toggle, clearing the class stays in registration.
    expect(result.current.viewMode).toBe('registration');
  });

  it('preserves existing hook functionality (search, status, payment filters)', () => {
    const entries = [
      makeEntry({ id: '1', dogName: 'Rex', entryStatus: EntryStatus.ACCEPTED }),
      makeEntry({ id: '2', dogName: 'Buddy', entryStatus: EntryStatus.PENDING }),
    ] as EntryManagementEntry[];

    const tabCounts = { all: 2, pending: 1, accepted: 1, waitlist: 0, issues: 0 };

    const { result } = renderHook(() => useEntryManagementFilters({ entries, tabCounts }), {
      wrapper: createWrapper(),
    });

    // Search should still work
    act(() => {
      result.current.setSearchTerm('Rex');
    });

    expect(result.current.filteredEntries.length).toBe(1);
    expect(result.current.filteredEntries[0].dogName).toBe('Rex');
  });
});
