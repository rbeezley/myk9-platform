// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  replicatedClassesTable,
  replicatedShowsTable,
  replicatedTrialsTable,
} from '@/services/replication';
import { isAtShowStructureOnDevice } from './atShowClassListAdapter';

afterEach(() => {
  vi.restoreAllMocks();
});

function seed({
  trials,
  trialsExpected,
  classes,
  classesExpected,
  pendingTrialDeletes = [],
}: {
  trials: Array<{ id: string; _localOnly?: boolean }>;
  trialsExpected: number;
  classes: Record<string, Array<{ id: string; _localOnly?: boolean }>>;
  classesExpected: Record<string, number>;
  pendingTrialDeletes?: string[];
}) {
  vi.spyOn(replicatedShowsTable, 'getShowById').mockResolvedValue({ id: 'show-1' } as never);
  vi.spyOn(replicatedTrialsTable, 'getSyncMetadata').mockResolvedValue({
    expectedRemoteRows: trialsExpected,
  } as never);
  vi.spyOn(replicatedTrialsTable, 'getTrialsByShow').mockResolvedValue(trials as never);
  vi.spyOn(replicatedTrialsTable.pendingDeletes, 'coveredIds').mockResolvedValue(
    new Set(pendingTrialDeletes)
  );
  vi.spyOn(replicatedClassesTable, 'getSyncMetadata').mockImplementation((async (id: string) => ({
    expectedRemoteRows: classesExpected[id],
  })) as never);
  vi.spyOn(replicatedClassesTable, 'getClassesByTrial').mockImplementation(
    (async (id: string) => classes[id] ?? []) as never
  );
}

describe('isAtShowStructureOnDevice (MYK9-1560)', () => {
  it('reads complete when every server-backed trial and class is here', async () => {
    seed({
      trials: [{ id: 't1' }],
      trialsExpected: 1,
      classes: { t1: [{ id: 'c1' }] },
      classesExpected: { t1: 1 },
    });
    expect(await isAtShowStructureOnDevice('show-1')).toBe(true);
  });

  it('still reads complete when a trial was deleted here and its DELETE is queued', async () => {
    seed({
      trials: [{ id: 't1' }],
      trialsExpected: 2,
      classes: { t1: [{ id: 'c1' }] },
      classesExpected: { t1: 1 },
      pendingTrialDeletes: ['t2'],
    });
    expect(await isAtShowStructureOnDevice('show-1')).toBe(true);
  });

  it('reads incomplete when a local-only trial masks a missing server trial', async () => {
    seed({
      trials: [{ id: 't1' }, { id: 't-local', _localOnly: true }],
      trialsExpected: 2,
      classes: { t1: [{ id: 'c1' }], 't-local': [] },
      classesExpected: { t1: 1, 't-local': 0 },
    });
    expect(await isAtShowStructureOnDevice('show-1')).toBe(false);
  });

  it('reads incomplete when a local-only class masks a missing server class', async () => {
    seed({
      trials: [{ id: 't1' }],
      trialsExpected: 1,
      classes: { t1: [{ id: 'c1' }, { id: 'c-local', _localOnly: true }] },
      classesExpected: { t1: 2 },
    });
    expect(await isAtShowStructureOnDevice('show-1')).toBe(false);
  });

  it('reads incomplete when a trial arrived but its classes did not', async () => {
    seed({
      trials: [{ id: 't1' }, { id: 't2' }],
      trialsExpected: 2,
      classes: { t1: [{ id: 'c1' }], t2: [] },
      classesExpected: { t1: 1, t2: 3 },
    });
    expect(await isAtShowStructureOnDevice('show-1')).toBe(false);
  });
});
