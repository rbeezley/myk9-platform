import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedClassesTable, replicatedTrialsTable } from '@/services/replication';
import {
  isAtShowClassDataHydrated,
  refreshAtShowClassListEntries,
  toClassEntry,
  type AtShowClassGroup,
} from './atShowClassListAdapter';

afterEach(() => vi.restoreAllMocks());

function makeGroups(): AtShowClassGroup[] {
  return [
    {
      trial: { id: 'trial-1' } as never,
      classes: [
        toClassEntry(
          {
            id: 'class-1',
            element: 'Container',
            level: 'Novice',
            classStatus: 'in_progress',
          },
          [],
          new Set()
        ),
      ],
      nextUpByClassId: new Map(),
    },
  ];
}

describe('refreshAtShowClassListEntries', () => {
  it('updates counts and next-up facts from the target-show snapshot only', () => {
    const entries: ReplicatedEntry[] = [
      {
        id: 'target-in-ring',
        showId: 'show-1',
        classId: 'class-1',
        armband: '101',
        checkInStatus: 'in-ring',
        isScored: false,
        runOrder: 1,
      },
      {
        id: 'target-scored',
        showId: 'show-1',
        classId: 'class-1',
        armband: '102',
        isScored: true,
        runOrder: 2,
      },
      {
        id: 'other-show',
        showId: 'show-2',
        classId: 'class-1',
        armband: '999',
        isScored: false,
        runOrder: 1,
      },
    ];

    const refreshed = refreshAtShowClassListEntries(makeGroups(), entries, 'show-1');

    expect(refreshed[0]?.classes[0]).toMatchObject({
      entry_count: 2,
      completed_count: 1,
    });
    expect(refreshed[0]?.nextUpByClassId.get('class-1')).toMatchObject({
      inRingArmband: '101',
      total: 2,
    });
  });

  it('does not mutate the existing query data', () => {
    const groups = makeGroups();

    const refreshed = refreshAtShowClassListEntries(groups, [], 'show-1');

    expect(refreshed).not.toBe(groups);
    expect(refreshed[0]).not.toBe(groups[0]);
    expect(groups[0]?.classes[0]?.entry_count).toBe(0);
  });
});

describe('isAtShowClassDataHydrated', () => {
  it('accepts a persisted zero-class scope as a truthful empty show', async () => {
    const groups = makeGroups();
    groups[0] = { ...groups[0]!, classes: [] };
    vi.spyOn(replicatedTrialsTable, 'getSyncMetadata').mockResolvedValue({
      expectedRemoteRows: 1,
    } as never);
    vi.spyOn(replicatedClassesTable, 'getSyncMetadata').mockResolvedValue({
      expectedRemoteRows: 0,
    } as never);

    await expect(isAtShowClassDataHydrated('show-1', groups)).resolves.toBe(true);
  });

  it('rejects an empty scope without persisted expected-row evidence', async () => {
    vi.spyOn(replicatedTrialsTable, 'getSyncMetadata').mockResolvedValue(null as never);

    await expect(isAtShowClassDataHydrated('show-1', [])).resolves.toBe(false);
  });
});
