import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useEntryManagementFilters } from '@/hooks/useEntryManagementFilters';
import type { EntryManagementEntry } from '@/types/entry-management-types';

const emptyTabCounts = { all: 0, pending: 0, accepted: 0, waitlist: 0, issues: 0 };

function createWrapper(initialEntry = '/') {
  return function Wrapper({ children }: { children: ReactNode }) {
    return MemoryRouter({ initialEntries: [initialEntry], children });
  };
}

function makeEntry(overrides: Partial<EntryManagementEntry> = {}): EntryManagementEntry {
  return {
    id: 'entry-1',
    registrationId: 'reg-1',
    entryNumber: 'E001',
    showId: 'show-1',
    dogName: 'Rex',
    ownerName: 'John Doe',
    ownerEmail: 'john@example.com',
    handlerName: 'John Doe',
    classes: [],
    totalFee: 50,
    paidAmount: 50,
    entryStatus: 'accepted',
    paymentStatus: 'paid',
    submittedAt: new Date(),
    lastUpdated: new Date(),
    ...overrides,
  } as EntryManagementEntry;
}

describe('useEntryManagementFilters — trial/class filters', () => {
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

  it('derives viewMode "roster" when trial is set but class is not', () => {
    const { result } = renderHook(
      () => useEntryManagementFilters({ entries: [], tabCounts: emptyTabCounts }),
      { wrapper: createWrapper('/?trial=trial-1') }
    );

    expect(result.current.viewMode).toBe('roster');
  });

  it('derives viewMode "scoring" when both trial and class are set', () => {
    const { result } = renderHook(
      () => useEntryManagementFilters({ entries: [], tabCounts: emptyTabCounts }),
      { wrapper: createWrapper('/?trial=trial-1&class=class-1') }
    );

    expect(result.current.viewMode).toBe('scoring');
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

  it('existing status/payment filters still apply when trial filter is active (filter stacking)', () => {
    const entries = [
      makeEntry({ id: '1', entryStatus: 'accepted', paymentStatus: 'paid' }),
      makeEntry({ id: '2', entryStatus: 'pending', paymentStatus: 'unpaid' }),
      makeEntry({ id: '3', entryStatus: 'accepted', paymentStatus: 'unpaid' }),
    ] as EntryManagementEntry[];

    const tabCounts = { all: 3, pending: 1, accepted: 2, waitlist: 0, issues: 0 };

    const { result } = renderHook(
      () => useEntryManagementFilters({ entries, tabCounts }),
      { wrapper: createWrapper('/?trial=trial-1') }
    );

    // Set status filter to 'accepted'
    act(() => {
      result.current.setStatusFilter('accepted');
    });

    expect(result.current.filteredEntries.length).toBe(2);

    // Also set payment filter
    act(() => {
      result.current.setPaymentFilter('unpaid');
    });

    expect(result.current.filteredEntries.length).toBe(1);
    expect(result.current.filteredEntries[0].id).toBe('3');
  });

  it('clearFilters clears trial and class filters along with other filters', () => {
    const { result } = renderHook(
      () => useEntryManagementFilters({ entries: [], tabCounts: emptyTabCounts }),
      { wrapper: createWrapper('/?trial=trial-1&class=class-1') }
    );

    expect(result.current.trialFilter).toBe('trial-1');
    expect(result.current.classFilter).toBe('class-1');

    act(() => {
      result.current.clearFilters();
    });

    expect(result.current.trialFilter).toBeNull();
    expect(result.current.classFilter).toBeNull();
    expect(result.current.viewMode).toBe('registration');
  });

  it('clears trial and class filters when showId changes', () => {
    const { result, rerender } = renderHook(
      ({ showId }) =>
        useEntryManagementFilters({ entries: [], tabCounts: emptyTabCounts, showId }),
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
    expect(result.current.viewMode).toBe('scoring');
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
    expect(result.current.viewMode).toBe('roster');
  });

  it('preserves existing hook functionality (search, status, payment filters)', () => {
    const entries = [
      makeEntry({ id: '1', dogName: 'Rex', entryStatus: 'accepted' }),
      makeEntry({ id: '2', dogName: 'Buddy', entryStatus: 'pending' }),
    ] as EntryManagementEntry[];

    const tabCounts = { all: 2, pending: 1, accepted: 1, waitlist: 0, issues: 0 };

    const { result } = renderHook(
      () => useEntryManagementFilters({ entries, tabCounts }),
      { wrapper: createWrapper() }
    );

    // Search should still work
    act(() => {
      result.current.setSearchTerm('Rex');
    });

    expect(result.current.filteredEntries.length).toBe(1);
    expect(result.current.filteredEntries[0].dogName).toBe('Rex');
  });
});
