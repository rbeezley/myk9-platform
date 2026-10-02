/**
 * The local half of delete is driven by ONE declared table (LOCAL_STORES_BY_KIND).
 * For every kind and every "gone on the server" outcome, each declared store must
 * be purged (replica AND Zustand copy); for every Undo, each purged replica must
 * be re-synced. MYK9-922 rounds 1-2 found purge branches that picked their own
 * stores; this suite fails when a store is dropped from the table.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ remove: vi.fn(), restore: vi.fn() }));
// Nothing queued in these tests: the queue itself is covered by deleteUnsyncedWork's own test.
vi.mock('./deleteUnsyncedWork', async importOriginal => ({
  ...(await importOriginal<typeof import('./deleteUnsyncedWork')>()),
  deviceHasUnsavedWork: vi.fn().mockResolvedValue({ total: 0, failed: 0 }),
}));
vi.mock('./deleteServer', () => ({
  softDeleteOnServer: mocks.remove,
  restoreOnServer: mocks.restore,
}));

import {
  replicatedClassesTable,
  replicatedClubsTable,
  replicatedDogsTable,
  replicatedEntriesTable,
  replicatedShowsTable,
  replicatedTrialsTable,
} from '@/services/replication';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { useClassStore } from '@/store/classStore';
import { useClubStore } from '@/store/clubStore';
import { useEntryStore } from '@/store/entryStore';
import { useUserStore } from '@/store/userStore';
import { deleteRecords, restoreRecords } from './deleteRecords';
import { reconcileLocalDeletion } from './deleteLocalState';
import { LOCAL_STORES_BY_KIND, type LocalStoreName } from './deleteLocalStores';
import type { DeleteObjectKind, DeleteTarget } from './deleteTypes';

const KINDS: DeleteObjectKind[] = ['show', 'trial', 'class', 'entry', 'dog', 'club', 'person'];

/** Written by hand from soft_delete_* (migration 20261001214300): what each kind reaches. */
const EXPECTED_CASCADE: Record<DeleteObjectKind, LocalStoreName[]> = {
  show: ['shows', 'trials', 'classes', 'entries'],
  trial: ['trials', 'classes', 'entries'],
  class: ['classes', 'entries'],
  entry: ['entries'],
  dog: ['dogs', 'entries'],
  club: ['clubs'],
  person: ['people'],
};

// Fixture graph. Everything under s1/t1/c1 plus dog d1, club k1, person p1.
const rows = {
  trials: [{ id: 't1', showId: 's1' }],
  classes: [{ id: 'c1', trialId: 't1' }],
  entries: [
    { id: 'e1', classId: 'c1', showId: 's1', trialId: 't1', dogId: 'd1' },
    { id: 'e2', trialId: 't1', showId: 's1', dogId: 'd2' }, // by trial_id, no class
    { id: 'e3', showId: 's1', dogId: 'd3' }, // by show_id only
  ],
};
const TARGETS: Record<DeleteObjectKind, DeleteTarget> = {
  show: { id: 's1', name: 'Show' },
  trial: { id: 't1', name: 'T1', context: { showId: 's1' } },
  class: { id: 'c1', name: 'C1', context: { showId: 's1', trialId: 't1' } },
  entry: { id: 'e1', name: 'E1', context: { showId: 's1' } },
  dog: { id: 'd1', name: 'Biscuit' },
  club: { id: 'k1', name: 'Club' },
  person: { id: 'p1', name: 'Pat' },
};
/** Entry ids each kind must drop (RPC cascade). */
const ENTRIES_GONE: Record<DeleteObjectKind, string[]> = {
  show: ['e1', 'e2', 'e3'],
  trial: ['e1', 'e2'],
  class: ['e1'],
  entry: ['e1'],
  dog: ['e1'],
  club: [],
  person: [],
};

const spy = {
  showsDelete: vi.spyOn(replicatedShowsTable, 'delete'),
  trialsGetAll: vi.spyOn(replicatedTrialsTable, 'getAllOrThrow'),
  trialsBatchDelete: vi.spyOn(replicatedTrialsTable, 'batchDelete'),
  classesGetAll: vi.spyOn(replicatedClassesTable, 'getAllOrThrow'),
  classesBatchDelete: vi.spyOn(replicatedClassesTable, 'batchDelete'),
  entriesGetAll: vi.spyOn(replicatedEntriesTable, 'getAllOrThrow'),
  entriesBatchDelete: vi.spyOn(replicatedEntriesTable, 'batchDelete'),
  dogsDelete: vi.spyOn(replicatedDogsTable, 'delete'),
  clubsDelete: vi.spyOn(replicatedClubsTable, 'delete'),
  showsSync: vi.spyOn(replicatedShowsTable, 'sync'),
  showsGetAll: vi.spyOn(replicatedShowsTable, 'getAllOrThrow'),
  trialsSync: vi.spyOn(replicatedTrialsTable, 'sync'),
  classesSync: vi.spyOn(replicatedClassesTable, 'sync'),
  entriesSync: vi.spyOn(replicatedEntriesTable, 'sync'),
  dogsSync: vi.spyOn(replicatedDogsTable, 'sync'),
  clubsSync: vi.spyOn(replicatedClubsTable, 'sync'),
  // The purge-time guard (MYK9-922): true when the row holds work the server lacks.
  showsWork: vi.spyOn(replicatedShowsTable, 'hasUnsyncedLocalWork'),
  trialsWork: vi.spyOn(replicatedTrialsTable, 'hasUnsyncedLocalWork'),
  classesWork: vi.spyOn(replicatedClassesTable, 'hasUnsyncedLocalWork'),
  entriesWork: vi.spyOn(replicatedEntriesTable, 'hasUnsyncedLocalWork'),
  dogsWork: vi.spyOn(replicatedDogsTable, 'hasUnsyncedLocalWork'),
  clubsWork: vi.spyOn(replicatedClubsTable, 'hasUnsyncedLocalWork'),
};
const loaders = {
  loadShows: vi.fn(),
  loadTrials: vi.fn(),
  loadTrialClasses: vi.fn(),
  loadClasses: vi.fn(),
  loadEntries: vi.fn(),
  loadClubs: vi.fn(),
  loadPeople: vi.fn(),
};

const asStore = <T>(value: unknown) => value as T;

beforeEach(() => {
  for (const fn of Object.values(spy)) fn.mockReset().mockResolvedValue(undefined as never);
  for (const fn of [
    spy.showsWork,
    spy.trialsWork,
    spy.classesWork,
    spy.entriesWork,
    spy.dogsWork,
    spy.clubsWork,
  ]) {
    fn.mockResolvedValue(false);
  }
  for (const fn of Object.values(loaders)) fn.mockReset().mockResolvedValue(undefined);
  mocks.remove.mockReset().mockResolvedValue('deleted');
  mocks.restore.mockReset().mockResolvedValue(undefined);
  spy.trialsGetAll.mockResolvedValue(rows.trials as never);
  spy.classesGetAll.mockResolvedValue(rows.classes as never);
  spy.entriesGetAll.mockResolvedValue(rows.entries as never);
  spy.showsGetAll.mockResolvedValue([{ id: 's1' }, { id: 's2' }] as never);
  useShowStore.setState({
    shows: asStore([{ id: 's1' }, { id: 's9' }]),
    selectedShowId: 's1',
    loadShows: loaders.loadShows,
  });
  useTrialStore.setState({
    trials: asStore([
      { id: 't1', showId: 's1' },
      { id: 't9', showId: 's9' },
    ]),
    trialClasses: asStore({ t1: [{ id: 'c1' }], t9: [{ id: 'c9' }] }),
    selectedTrialId: 't1',
    loadTrials: loaders.loadTrials,
    loadTrialClasses: loaders.loadTrialClasses,
  });
  useClassStore.setState({
    classes: asStore([{ id: 'c1' }, { id: 'c9' }]),
    entries: asStore([
      { id: 'e1', classId: 'c1' },
      { id: 'e9', classId: 'c9' },
    ]),
    loadClasses: loaders.loadClasses,
  });
  useEntryStore.setState({
    entries: asStore([...rows.entries, { id: 'e9', classId: 'c9', showId: 's9', dogId: 'd9' }]),
    loadEntries: loaders.loadEntries,
  });
  useClubStore.setState({
    clubs: asStore([{ id: 'k1' }, { id: 'k9' }]),
    selectedClubId: 'k1',
    loadClubs: loaders.loadClubs,
  });
  useUserStore.setState({
    users: asStore([{ id: 'p1' }, { id: 'p9' }]),
    people: asStore([{ id: 'p1' }, { id: 'p9' }]),
    loadPeople: loaders.loadPeople,
  });
});

/** Replica + Zustand probes for each declared store, given the kind under test. */
const PURGE_PROBES: Record<LocalStoreName, (kind: DeleteObjectKind) => void> = {
  shows: () => {
    expect(spy.showsDelete).toHaveBeenCalledWith('s1');
    expect(useShowStore.getState().shows.map(s => s.id)).toEqual(['s9']);
  },
  trials: () => {
    expect(spy.trialsBatchDelete).toHaveBeenCalledWith(['t1']);
    expect(useTrialStore.getState().trials.map(t => t.id)).toEqual(['t9']);
    expect(useTrialStore.getState().trialClasses.t1).toBeUndefined();
  },
  classes: () => {
    expect(spy.classesBatchDelete).toHaveBeenCalledWith(['c1']);
    const left = Object.values(useTrialStore.getState().trialClasses).flat();
    expect(left.map(c => c.id)).toEqual(['c9']);
    expect(useClassStore.getState().classes.map(c => c.id)).toEqual(['c9']);
  },
  entries: kind => {
    const gone = ENTRIES_GONE[kind];
    expect(spy.entriesBatchDelete.mock.calls.flatMap(([ids]) => ids).sort()).toEqual(gone);
    const left = useEntryStore.getState().entries.map(e => e.id);
    expect(left.filter(id => gone.includes(id))).toEqual([]);
    expect(left).toContain('e9');
    expect(useClassStore.getState().entries.map(e => e.id)).not.toContain('e1');
  },
  dogs: () => expect(spy.dogsDelete).toHaveBeenCalledWith('d1'),
  clubs: () => {
    expect(spy.clubsDelete).toHaveBeenCalledWith('k1');
    expect(useClubStore.getState().clubs.map(c => c.id)).toEqual(['k9']);
  },
  people: () => {
    expect(useUserStore.getState().people.map(p => p.id)).toEqual(['p9']);
    expect(useUserStore.getState().users.map(p => p.id)).toEqual(['p9']);
  },
};

const RESTORE_PROBES: Record<LocalStoreName, (kind: DeleteObjectKind) => void> = {
  shows: () => {
    expect(spy.showsSync).toHaveBeenCalledWith('');
    expect(loaders.loadShows).toHaveBeenCalled();
  },
  trials: () => {
    expect(spy.trialsSync).toHaveBeenCalledWith('s1');
    expect(loaders.loadTrials).toHaveBeenCalled();
  },
  classes: () => {
    expect(spy.classesSync).toHaveBeenCalledWith('t1');
    expect(loaders.loadTrialClasses).toHaveBeenCalled();
    expect(loaders.loadClasses).toHaveBeenCalled();
  },
  entries: kind => {
    // A dog's entries live in any show, so every show scope is re-read.
    const scopes = spy.entriesSync.mock.calls.map(([id]) => id).sort();
    expect(scopes).toEqual(kind === 'dog' ? ['s1', 's2'] : ['s1']);
    expect(loaders.loadEntries).toHaveBeenCalled();
  },
  dogs: () => expect(spy.dogsSync).toHaveBeenCalled(),
  clubs: () => {
    expect(spy.clubsSync).toHaveBeenCalled();
    expect(loaders.loadClubs).toHaveBeenCalled();
  },
  people: () => expect(loaders.loadPeople).toHaveBeenCalled(),
};

describe('the declared local-store table', () => {
  it('has a non-empty entry for every delete kind, matching the soft_delete_* cascade', () => {
    expect(Object.keys(LOCAL_STORES_BY_KIND).sort()).toEqual([...KINDS].sort());
    for (const kind of KINDS) {
      expect([...LOCAL_STORES_BY_KIND[kind]]).toEqual(EXPECTED_CASCADE[kind]);
    }
  });

  it('has a purge probe and a restore probe for every store it names', () => {
    const named = new Set(Object.values(LOCAL_STORES_BY_KIND).flat());
    for (const name of named) {
      expect(PURGE_PROBES[name]).toBeTypeOf('function');
      expect(RESTORE_PROBES[name]).toBeTypeOf('function');
    }
  });
});

describe.each(KINDS)('%s', kind => {
  const outcomes = [
    ['deleted by this call', async () => undefined],
    [
      'already deleted on the server',
      async () => mocks.remove.mockResolvedValue('already-deleted'),
    ],
    [
      'already deleted (P0002 error)',
      async () => mocks.remove.mockRejectedValue({ code: 'P0002', message: 'already deleted' }),
    ],
  ] as const;

  it.each(outcomes)('purges every declared store when %s', async (_label, arrange) => {
    await arrange();
    const result = await deleteRecords(kind, [TARGETS[kind]]);
    expect(result.failed).toEqual([]);
    for (const name of LOCAL_STORES_BY_KIND[kind]) PURGE_PROBES[name](kind);
  });

  it('Undo re-syncs every declared store the delete purged', async () => {
    // The delete purged the replica; the restore re-reads the trials it re-synced.
    await restoreRecords(kind, [TARGETS[kind]]);
    for (const name of LOCAL_STORES_BY_KIND[kind]) RESTORE_PROBES[name](kind);
  });

  it('never throws when every replica fails', async () => {
    for (const fn of Object.values(spy)) fn.mockRejectedValue(new Error('IndexedDB is gone'));
    await expect(reconcileLocalDeletion(kind, TARGETS[kind])).resolves.toBeUndefined();
    const restored = await restoreRecords(kind, [TARGETS[kind]]);
    expect(restored.failed).toEqual([]);
  });
});

/**
 * MYK9-922 round 9: the unsaved-work check runs BEFORE the server call, so an
 * entry created or edited in another tab while the RPC is in flight is not seen
 * by it. The purge therefore asks again, row by row, at the moment it drops the
 * row: anything with local work survives for normal sync (the server refuses an
 * upload under the deleted parent, and the replication layer reports it).
 */
describe('purge-time guard: a row that gained local work after the check survives', () => {
  const WORK_SPY: Record<
    LocalStoreName,
    { mockResolvedValue: (value: boolean) => unknown } | undefined
  > = {
    shows: spy.showsWork,
    trials: spy.trialsWork,
    classes: spy.classesWork,
    entries: spy.entriesWork,
    dogs: spy.dogsWork,
    clubs: spy.clubsWork,
    people: undefined,
  };

  it('keeps only the entry that became dirty, and purges its siblings', async () => {
    spy.entriesWork.mockImplementation(async id => id === 'e1');
    await reconcileLocalDeletion('class', TARGETS.class);
    expect(spy.entriesBatchDelete).not.toHaveBeenCalledWith(expect.arrayContaining(['e1']));
    expect(useEntryStore.getState().entries.map(e => e.id)).toContain('e1');
    expect(useClassStore.getState().entries.map(e => e.id)).toContain('e1');
    // Same kind, an entry with no local work is still purged.
    await reconcileLocalDeletion('trial', TARGETS.trial);
    expect(spy.entriesBatchDelete).toHaveBeenCalledWith(['e2']);
    expect(useEntryStore.getState().entries.map(e => e.id)).not.toContain('e2');
  });

  it.each(KINDS)(
    '%s: when every in-scope row has local work, no store drops anything',
    async kind => {
      for (const name of LOCAL_STORES_BY_KIND[kind]) WORK_SPY[name]?.mockResolvedValue(true);
      const before = {
        shows: useShowStore.getState().shows,
        trials: useTrialStore.getState().trials,
        classes: useClassStore.getState().classes,
        entries: useEntryStore.getState().entries,
        clubs: useClubStore.getState().clubs,
      };
      await reconcileLocalDeletion(kind, TARGETS[kind]);
      if (kind === 'person') return; // people are not replicated; nothing queues for them
      expect(spy.showsDelete).not.toHaveBeenCalled();
      expect(spy.trialsBatchDelete).not.toHaveBeenCalled();
      expect(spy.classesBatchDelete).not.toHaveBeenCalled();
      expect(spy.entriesBatchDelete).not.toHaveBeenCalled();
      expect(spy.dogsDelete).not.toHaveBeenCalled();
      expect(spy.clubsDelete).not.toHaveBeenCalled();
      expect(useShowStore.getState().shows).toEqual(before.shows);
      expect(useTrialStore.getState().trials).toEqual(before.trials);
      expect(useClassStore.getState().classes).toEqual(before.classes);
      expect(useEntryStore.getState().entries).toEqual(before.entries);
      expect(useClubStore.getState().clubs).toEqual(before.clubs);
    }
  );

  it('a row that is dirty at purge time but was clean at the check survives a real delete', async () => {
    // Clean when deleteRecords checks the queue; dirty by the time the purge asks.
    spy.entriesWork.mockImplementation(async id => id === 'e3');
    const result = await deleteRecords('show', [TARGETS.show]);
    expect(result.failed).toEqual([]);
    expect(useEntryStore.getState().entries.map(e => e.id)).toContain('e3');
    expect(spy.entriesBatchDelete.mock.calls.flatMap(([ids]) => ids).sort()).toEqual(['e1', 'e2']);
  });
});
