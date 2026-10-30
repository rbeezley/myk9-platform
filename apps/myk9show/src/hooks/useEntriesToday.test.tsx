import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useEntriesToday } from './useEntriesToday';
import { useMyEntriesData } from '@/pages/MyEntriesPage/modules/useMyEntriesData';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import type { EntryClass, MyEntry } from '@/pages/MyEntriesPage/modules/my-entries-types';

vi.mock('@/pages/MyEntriesPage/modules/useMyEntriesData', () => ({ useMyEntriesData: vi.fn() }));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { subscribe: vi.fn(() => () => {}) },
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: { subscribe: vi.fn(() => () => {}) },
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: { subscribe: vi.fn(() => () => {}) },
}));
vi.mock('@/components/shows/browse/showsPaneGroups', () => ({
  REGROUP_INTERVAL_MS: 60_000,
  showsPaneGroupFor: () => 'today',
}));
vi.mock('@/utils/entryWindowZones', () => ({
  withEntryWindowTimeZones: (shows: unknown[]) => shows,
}));
vi.mock('@/store/showStore');
vi.mock('@/store/trialStore');

const refreshEntries = vi.fn();

function entriesWith(checkInStatus: EntryClass['checkInStatus']): MyEntry[] {
  const classes = [
    {
      id: 'e1',
      entryStatusKind: 'accepted',
      name: 'Container Novice A',
      status: 'entered',
      checkInStatus,
    },
  ] as unknown as EntryClass[];
  return [
    {
      id: 'order-1',
      showId: 'show-1',
      dogs: [{ id: 'd1', dogId: 'dog-1', dogName: 'Scout', classes }],
      classes,
    },
  ] as unknown as MyEntry[];
}

function mockSharedHook(entries: MyEntry[]) {
  (useMyEntriesData as ReturnType<typeof vi.fn>).mockReturnValue({ entries, refreshEntries });
}

beforeEach(() => {
  vi.clearAllMocks();
  (useShowStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (sel: (s: unknown) => unknown) => sel({ shows: [{ id: 'show-1', name: 'Spring Trial' }] })
  );
  (useTrialStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (sel: (s: unknown) => unknown) => sel({ trials: [] })
  );
});

describe('useEntriesToday', () => {
  it("derives today's lines from the shared entries hook, not its own read", () => {
    mockSharedHook(entriesWith('no-status'));
    const { result } = renderHook(() => useEntriesToday());
    expect(result.current.lines).toEqual([
      {
        entryId: 'e1',
        showId: 'show-1',
        dogCallName: 'Scout',
        classLabel: 'Container Novice A',
        statusLabel: 'Check in',
      },
    ]);
    expect(result.current.showNames.get('show-1')).toBe('Spring Trial');
  });

  it('follows the shared hook when a check-in status changes', () => {
    mockSharedHook(entriesWith('no-status'));
    const { result, rerender } = renderHook(() => useEntriesToday());
    expect(result.current.lines[0]?.statusLabel).toBe('Check in');
    mockSharedHook(entriesWith('checked-in'));
    rerender();
    expect(result.current.lines[0]?.statusLabel).toBe('Checked in');
  });

  it('asks the shared hook to re-read, once, when the entries replica changes', () => {
    vi.useFakeTimers();
    try {
      mockSharedHook(entriesWith('no-status'));
      renderHook(() => useEntriesToday());
      const subscribe = replicatedEntriesTable.subscribe as unknown as ReturnType<typeof vi.fn>;
      const onChange = subscribe.mock.calls[0]?.[0] as () => void;
      act(() => {
        onChange();
        onChange();
        vi.advanceTimersByTime(1000);
      });
      expect(refreshEntries).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
