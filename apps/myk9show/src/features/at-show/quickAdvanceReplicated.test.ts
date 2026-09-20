import { createElement, type PropsWithChildren } from 'react';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '@/services/database/connection';
import { toQuickAdvanceChips, formatChipLabel } from './quickAdvanceReplicated';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';

const quickAdvanceMocks = vi.hoisted(() => ({
  replicatedRead: vi.fn(),
  getAllDogs: vi.fn(),
  getByShow: vi.fn(),
  subscribe: vi.fn(() => vi.fn()),
  handlerListener: null as ((event: { ids: readonly string[] }) => void) | null,
  emitHandlerOnSubscribe: false,
  subscribeHandlerPeopleHydration: vi.fn(
    (callback: (event: { ids: readonly string[] }) => void) => {
      quickAdvanceMocks.handlerListener = callback;
      if (quickAdvanceMocks.emitHandlerOnSubscribe) callback({ ids: ['handler-1'] });
      return vi.fn();
    }
  ),
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    getEntriesByClass: quickAdvanceMocks.replicatedRead,
    subscribe: quickAdvanceMocks.subscribe,
  },
}));

vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: { getAllDogs: quickAdvanceMocks.getAllDogs },
}));

vi.mock('@/services/replication/ReplicatedArmbandsTable', () => ({
  replicatedArmbandsTable: { getByShow: quickAdvanceMocks.getByShow },
}));

vi.mock('@/services/database/entries/handlerHydration', async () => {
  const actual = await vi.importActual<
    typeof import('@/services/database/entries/handlerHydration')
  >('@/services/database/entries/handlerHydration');
  return {
    ...actual,
    subscribeHandlerPeopleHydration: quickAdvanceMocks.subscribeHandlerPeopleHydration,
  };
});

import { QuickAdvancePanel } from './quickAdvancePanel';

function entry(over: Partial<ReplicatedEntry> & { id: string }): ReplicatedEntry {
  return {
    classId: 'class-1',
    armband: over.id,
    dogCallName: `Dog ${over.id}`,
    dogBreed: 'Golden Retriever',
    runOrder: Number(over.id),
    isScored: false,
    ...over,
  };
}

function queryWrapper(client: QueryClient) {
  return function TestQueryProvider({ children }: PropsWithChildren) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

const paperGateClass: ReplicatedEntry[] = [
  entry({ id: '3' }),
  entry({ id: '1' }),
  entry({ id: '4' }),
  entry({ id: '2' }),
];

describe('toQuickAdvanceChips — no check-in status data (paper gate)', () => {
  it('offers the next three pending dogs in run order with armband, name and breed', () => {
    const chips = toQuickAdvanceChips(paperGateClass);
    expect(chips.map(c => c.entryId)).toEqual(['1', '2', '3']);
    expect(chips[0]).toEqual({
      entryId: '1',
      armband: '1',
      callName: 'Dog 1',
      breed: 'Golden Retriever',
      gateLabel: null,
    });
    expect(formatChipLabel(chips[0]!)).toBe('#1 Dog 1 — Golden Retriever');
  });

  it('never offers the dog just scored', () => {
    const chips = toQuickAdvanceChips(paperGateClass, { excludeEntryId: '1' });
    expect(chips.map(c => c.entryId)).toEqual(['2', '3', '4']);
  });
});

describe('toQuickAdvanceChips — opportunistic gate statuses', () => {
  it('leads with at-gate, then come-to-gate, and labels them', () => {
    const chips = toQuickAdvanceChips([
      entry({ id: '1' }),
      entry({ id: '2' }),
      entry({ id: '8', checkInStatus: 'come-to-gate' }),
      entry({ id: '9', checkInStatus: 'at-gate' }),
    ]);
    expect(chips.map(c => c.entryId)).toEqual(['9', '8', '1']);
    expect(chips.map(c => c.gateLabel)).toEqual(['At gate', 'Called to gate', null]);
  });

  it('reads the snake_case check-in alias too', () => {
    const chips = toQuickAdvanceChips([
      entry({ id: '1' }),
      entry({ id: '7', check_in_status: 'at-gate' }),
    ]);
    expect(chips.map(c => c.entryId)).toEqual(['7', '1']);
  });
});

describe('toQuickAdvanceChips — end of class and queue exclusions', () => {
  it('excludes the in-ring dog, scored dogs and pulled dogs', () => {
    const chips = toQuickAdvanceChips([
      entry({ id: '1', isInRing: true }),
      entry({ id: '2', isScored: true }),
      entry({ id: '3', checkInStatus: 'pulled' }),
      entry({ id: '4' }),
    ]);
    expect(chips.map(c => c.entryId)).toEqual(['4']);
  });

  it('returns fewer than three when fewer remain', () => {
    expect(toQuickAdvanceChips([entry({ id: '1' }), entry({ id: '2' })])).toHaveLength(2);
  });

  it('returns nothing when the last dog in the class was the one just scored', () => {
    expect(toQuickAdvanceChips([entry({ id: '1' })], { excludeEntryId: '1' })).toEqual([]);
  });
});

describe('formatChipLabel', () => {
  it('degrades gracefully when display fields are missing', () => {
    expect(
      formatChipLabel({ entryId: 'x', armband: '', callName: '', breed: '', gateLabel: null })
    ).toBe('Next dog');
    expect(
      formatChipLabel({ entryId: 'x', armband: '12', callName: '', breed: '', gateLabel: null })
    ).toBe('#12');
    expect(
      formatChipLabel({
        entryId: 'x',
        armband: '',
        callName: 'Bella',
        breed: 'Poodle',
        gateLabel: null,
      })
    ).toBe('Bella — Poodle');
  });
});

describe('QuickAdvancePanel offline projected read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    quickAdvanceMocks.handlerListener = null;
    quickAdvanceMocks.emitHandlerOnSubscribe = false;
    vi.spyOn(db.instance.people, 'bulkGet').mockResolvedValue([]);
    quickAdvanceMocks.replicatedRead.mockResolvedValue([
      {
        id: 'next-entry',
        classId: 'class-1',
        showId: 'show-1',
        dogId: 'dog-1',
        handlerId: 'handler-1',
        handler: 'Jamie Handler',
        armband: '12',
        runOrder: 1,
        checkInStatus: 'no-status',
        entryStatus: 'confirmed',
        isScored: false,
        dogCallName: 'Scout',
        dogBreed: 'Beagle',
      },
    ]);
    quickAdvanceMocks.getAllDogs.mockResolvedValue([]);
  });

  it('renders local quick-advance chips while offline after a score save', async () => {
    const originalOnline = navigator.onLine;
    const originalQueryOnline = onlineManager.isOnline();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    onlineManager.setOnline(false);
    try {
      render(
        createElement(QuickAdvancePanel, {
          classId: 'class-1',
          scoredEntryId: 'scored-entry',
          onBackToList: () => {},
          onCorrectScore: () => {},
          onPickEntry: () => {},
        }),
        { wrapper: queryWrapper(new QueryClient()) }
      );

      await waitFor(() => expect(screen.getByTestId('quick-advance-entry')).toBeInTheDocument());
      expect(screen.getByText('#12 Scout — Beagle')).toBeInTheDocument();
      expect(quickAdvanceMocks.replicatedRead).toHaveBeenCalledWith('class-1');
      expect(quickAdvanceMocks.getAllDogs).toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
      onlineManager.setOnline(originalQueryOnline);
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: originalOnline,
      });
    }
  });

  it('bounds quick-advance reads after one relevant deferred completion', async () => {
    const originalOnline = navigator.onLine;
    const originalQueryOnline = onlineManager.isOnline();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    onlineManager.setOnline(false);
    try {
      render(
        createElement(QuickAdvancePanel, {
          classId: 'class-1',
          scoredEntryId: 'scored-entry',
          onBackToList: () => {},
          onCorrectScore: () => {},
          onPickEntry: () => {},
        }),
        { wrapper: queryWrapper(new QueryClient()) }
      );
      await waitFor(() => expect(screen.getByTestId('quick-advance-entry')).toBeInTheDocument());
      const readsBeforeCompletion = quickAdvanceMocks.replicatedRead.mock.calls.length;

      act(() => quickAdvanceMocks.handlerListener?.({ ids: ['unrelated-person'] }));
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(quickAdvanceMocks.replicatedRead.mock.calls.length).toBe(readsBeforeCompletion);

      act(() => quickAdvanceMocks.handlerListener?.({ ids: ['handler-1'] }));
      await waitFor(() =>
        expect(quickAdvanceMocks.replicatedRead).toHaveBeenCalledTimes(readsBeforeCompletion + 1)
      );
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(quickAdvanceMocks.replicatedRead.mock.calls.length).toBe(readsBeforeCompletion + 1);
    } finally {
      vi.restoreAllMocks();
      onlineManager.setOnline(originalQueryOnline);
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: originalOnline,
      });
    }
  });

  it('bounds quick-advance reads after a fast handler completion', async () => {
    quickAdvanceMocks.emitHandlerOnSubscribe = true;
    const originalOnline = navigator.onLine;
    const originalQueryOnline = onlineManager.isOnline();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    onlineManager.setOnline(false);
    try {
      render(
        createElement(QuickAdvancePanel, {
          classId: 'class-1',
          scoredEntryId: 'scored-entry',
          onBackToList: () => {},
          onCorrectScore: () => {},
          onPickEntry: () => {},
        }),
        { wrapper: queryWrapper(new QueryClient()) }
      );
      await waitFor(() => expect(screen.getByTestId('quick-advance-entry')).toBeInTheDocument());
      expect(quickAdvanceMocks.replicatedRead.mock.calls.length).toBeLessThanOrEqual(2);
    } finally {
      vi.restoreAllMocks();
      onlineManager.setOnline(originalQueryOnline);
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: originalOnline,
      });
    }
  });
});
