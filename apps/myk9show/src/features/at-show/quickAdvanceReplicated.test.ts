import { createElement, type PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toQuickAdvanceChips, formatChipLabel } from './quickAdvanceReplicated';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';

const quickAdvanceMocks = vi.hoisted(() => ({
  projectedRead: vi.fn(),
  replicatedRead: vi.fn(),
  subscribe: vi.fn(() => vi.fn()),
  subscribeHandlerPeopleHydration: vi.fn(() => vi.fn()),
}));

vi.mock('@/services/database/entries', () => ({
  getEntriesByClass: quickAdvanceMocks.projectedRead,
}));

vi.mock('@/services/database/entries/handlerHydration', () => ({
  subscribeHandlerPeopleHydration: quickAdvanceMocks.subscribeHandlerPeopleHydration,
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    getEntriesByClass: quickAdvanceMocks.replicatedRead,
    subscribe: quickAdvanceMocks.subscribe,
  },
}));

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
    quickAdvanceMocks.projectedRead.mockResolvedValue({
      data: [
        {
          id: 'next-entry',
          class_id: 'class-1',
          show_id: 'show-1',
          armband: '12',
          run_order: 1,
          check_in_status: 'no-status',
          entry_status: 'confirmed',
          is_scored: false,
          dog: { call_name: 'Scout', breed: 'Beagle' },
          handler_identity: { name: 'Olivia Owner', source: 'owner', person: null },
        },
      ],
      error: null,
    });
  });

  it('renders local quick-advance chips while offline after a score save', async () => {
    const originalOnline = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
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
      expect(quickAdvanceMocks.projectedRead).toHaveBeenCalledWith('class-1');
      expect(quickAdvanceMocks.replicatedRead).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: originalOnline,
      });
    }
  });
});
