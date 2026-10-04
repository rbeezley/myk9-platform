/**
 * MYK9-990: the Armband/Random presets pin exactly what hand placement pins.
 * A dog whose only in-ring signal is the `is_in_ring` boolean must never be
 * renumbered mid-run, and a preset writes only the dogs that actually move.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';
import { useShowMapRunOrderAutoSort } from '../useShowMapRunOrderAutoSort';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';

const { getEntriesByClassMock, updateEntryMock, getArmbandsMock } = vi.hoisted(() => ({
  getEntriesByClassMock: vi.fn<(classId: string) => Promise<ReplicatedEntry[]>>(),
  updateEntryMock:
    vi.fn<(id: string, updates: Partial<ReplicatedEntry>) => Promise<string | null>>(),
  getArmbandsMock: vi.fn<(showId: string) => Promise<unknown[]>>(),
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    getEntriesByClass: getEntriesByClassMock,
    updateEntry: updateEntryMock,
  },
}));
vi.mock('@/services/replication/ReplicatedArmbandsTable', () => ({
  replicatedArmbandsTable: { getByShow: getArmbandsMock },
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const e = (id: string, armband: string, runOrder: number, extra: Partial<ReplicatedEntry> = {}) =>
  ({ id, armband, runOrder, ...extra }) as ReplicatedEntry;

function render() {
  const client = createTestQueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useShowMapRunOrderAutoSort({ showId: 's1' }), { wrapper });
}

const writtenIds = () => updateEntryMock.mock.calls.map(([id]) => id);

beforeEach(() => {
  getEntriesByClassMock.mockReset();
  updateEntryMock.mockReset().mockResolvedValue('mutation-id');
  getArmbandsMock.mockReset().mockResolvedValue([]);
  vi.restoreAllMocks();
});

describe('presets never renumber a dog whose only in-ring signal is is_in_ring', () => {
  beforeEach(() => {
    getEntriesByClassMock.mockResolvedValue([
      e('e1', '130', 1),
      e('e2', '110', 2, { is_in_ring: true } as Partial<ReplicatedEntry>),
      e('e3', '120', 3),
      e('e4', '100', 4),
    ]);
  });

  it.each(['armband-asc', 'armband-desc'] as const)('%s', async kind => {
    const { result } = render();
    act(() => result.current.autoSort({ classId: 'c1', kind }));
    await waitFor(() => expect(result.current.lastAutoSort).not.toBeNull());
    expect(writtenIds()).not.toContain('e2');
  });

  it('armband-asc writes only the dogs that move, around the in-ring dog', async () => {
    const { result } = render();
    act(() => result.current.autoSort({ classId: 'c1', kind: 'armband-asc' }));
    await waitFor(() => expect(result.current.lastAutoSort).not.toBeNull());
    // The in-ring dog holds 2; the three waiting dogs are renumbered after it.
    expect(updateEntryMock.mock.calls).toEqual([
      ['e4', { runOrder: 3 }],
      ['e3', { runOrder: 4 }],
      ['e1', { runOrder: 5 }],
    ]);
    expect(result.current.lastAutoSort?.priorOrders).toEqual([
      { id: 'e4', runOrder: 4 },
      { id: 'e3', runOrder: 3 },
      { id: 'e1', runOrder: 1 },
    ]);
  });

  it('random', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const { result } = render();
    act(() => result.current.autoSort({ classId: 'c1', kind: 'random' }));
    await waitFor(() => expect(result.current.lastAutoSort).not.toBeNull());
    expect(writtenIds()).not.toContain('e2');
  });
});

describe('presets only touch the class run list', () => {
  it('never writes run_order to a withdrawn or deleted row', async () => {
    getEntriesByClassMock.mockResolvedValue([
      e('e1', '130', 1),
      e('e2', '110', 2, { entryStatus: 'withdrawn' } as Partial<ReplicatedEntry>),
      e('e3', '120', 3, { deletedAt: '2026-10-01T00:00:00Z' } as Partial<ReplicatedEntry>),
      e('e4', '100', 4),
    ]);
    const { result } = render();
    act(() => result.current.autoSort({ classId: 'c1', kind: 'armband-asc' }));
    await waitFor(() => expect(result.current.lastAutoSort).not.toBeNull());
    // e4 already holds 4, the number after the highest off-list row (3).
    expect(writtenIds()).toEqual(['e1']);
  });
});
