/**
 * After a server soft delete, the item (and what went with it) leaves this
 * device's replicas AND the stores the lists render from, so the list updates
 * without a reload. A purge runs only after the server delete succeeded, so it
 * must never throw, even when the replica itself fails.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  replicatedClassesTable,
  replicatedClubsTable,
  replicatedDogsTable,
  replicatedEntriesTable,
  replicatedTrialsTable,
} from '@/services/replication';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { useClubStore } from '@/store/clubStore';
import { useEntryStore } from '@/store/entryStore';
import { purgeDeletedLocally } from './deletePurge';
import type { SyncableTrial, SyncableTrialClass } from '@/store/trial-store-types';
import type { SyncableShowEntry } from '@/store/entry-store-types';
import type { Club } from '@/types/club-types';

const trialClass = (id: string) => ({ id }) as unknown as SyncableTrialClass;
const trial = (id: string, showId: string) => ({ id, showId }) as unknown as SyncableTrial;
const entry = (id: string) => ({ id }) as unknown as SyncableShowEntry;

const spies = {
  classesGetAll: vi.spyOn(replicatedClassesTable, 'getAllOrThrow'),
  classesBatchDelete: vi.spyOn(replicatedClassesTable, 'batchDelete'),
  trialsGetAll: vi.spyOn(replicatedTrialsTable, 'getAllOrThrow'),
  trialsBatchDelete: vi.spyOn(replicatedTrialsTable, 'batchDelete'),
  entriesGetAll: vi.spyOn(replicatedEntriesTable, 'getAllOrThrow'),
  entriesBatchDelete: vi.spyOn(replicatedEntriesTable, 'batchDelete'),
  dogsDelete: vi.spyOn(replicatedDogsTable, 'delete'),
  clubsDelete: vi.spyOn(replicatedClubsTable, 'delete'),
};

beforeEach(() => {
  spies.classesGetAll.mockResolvedValue([
    { id: 'c1', trialId: 't1' },
    { id: 'c2', trialId: 't1' },
    { id: 'c3', trialId: 't2' },
  ] as never);
  spies.trialsGetAll.mockResolvedValue([
    { id: 't1', showId: 's1' },
    { id: 't2', showId: 's2' },
  ] as never);
  spies.entriesGetAll.mockResolvedValue([
    { id: 'e1', classId: 'c1', showId: 's1', dogId: 'd1' },
    { id: 'e2', classId: 'c2', showId: 's1', dogId: 'd2' },
    { id: 'e3', classId: 'c3', showId: 's2', dogId: 'd1' },
  ] as never);
  for (const spy of [
    spies.classesBatchDelete,
    spies.trialsBatchDelete,
    spies.entriesBatchDelete,
    spies.dogsDelete,
    spies.clubsDelete,
  ]) {
    spy.mockResolvedValue(undefined);
  }
  useTrialStore.setState({
    trials: [trial('t1', 's1'), trial('t2', 's2')],
    trialClasses: { t1: [trialClass('c1'), trialClass('c2')], t2: [trialClass('c3')] },
    selectedTrialId: 't1',
  });
  useEntryStore.setState({ entries: [entry('e1'), entry('e2'), entry('e3')] });
  useClubStore.setState({
    clubs: [{ id: 'k1' } as Club, { id: 'k2' } as Club],
    selectedClubId: 'k1',
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

const entryIds = () => useEntryStore.getState().entries.map(e => e.id);

describe('purgeDeletedLocally', () => {
  it('trial: drops the trial, its classes and their entries', async () => {
    await purgeDeletedLocally('trial', { id: 't1', name: 'T1' });

    expect(spies.trialsBatchDelete).toHaveBeenCalledWith(['t1']);
    expect(spies.classesBatchDelete).toHaveBeenCalledWith(expect.arrayContaining(['c1', 'c2']));
    expect(spies.entriesBatchDelete).toHaveBeenCalledWith(['e1', 'e2']);
    const state = useTrialStore.getState();
    expect(state.trials.map(t => t.id)).toEqual(['t2']);
    expect(state.trialClasses.t1).toBeUndefined();
    expect(state.selectedTrialId).toBeNull();
    expect(entryIds()).toEqual(['e3']);
  });

  it('trial: also drops entries stamped with the trial id but no known class (matches the RPC)', async () => {
    spies.entriesGetAll.mockResolvedValue([
      { id: 'e1', classId: 'c1', showId: 's1', dogId: 'd1' },
      { id: 'e4', trialId: 't1', showId: 's1', dogId: 'd4' },
      { id: 'e5', trialId: 't2', classId: 'c3', showId: 's2', dogId: 'd5' },
    ] as never);
    useEntryStore.setState({ entries: [entry('e1'), entry('e4'), entry('e5')] });

    await purgeDeletedLocally('trial', { id: 't1', name: 'T1' });

    const purged = spies.entriesBatchDelete.mock.calls.flatMap(([ids]) => ids);
    expect(purged.sort()).toEqual(['e1', 'e4']);
    expect(entryIds()).toEqual(['e5']);
  });

  it('class: one purge for every class surface — the class and its entries leave the stores', async () => {
    await purgeDeletedLocally('class', { id: 'c1', name: 'Novice A' });

    expect(spies.classesBatchDelete).toHaveBeenCalledWith(['c1']);
    expect(spies.entriesBatchDelete).toHaveBeenCalledWith(['e1']);
    expect(useTrialStore.getState().trialClasses.t1.map(c => c.id)).toEqual(['c2']);
    expect(entryIds()).toEqual(['e2', 'e3']);
  });

  it('show: purges the show and every trial, class and entry under it', async () => {
    const purgeDeletedShow = vi.fn().mockResolvedValue(undefined);
    useShowStore.setState({ purgeDeletedShow });

    await purgeDeletedLocally('show', { id: 's1', name: 'Show' });

    expect(purgeDeletedShow).toHaveBeenCalledWith('s1');
    expect(useTrialStore.getState().trials.map(t => t.id)).toEqual(['t2']);
    expect(entryIds()).toEqual(['e3']);
  });

  it('entry: leaves the entry store (the server call already evicted the replica row)', async () => {
    await purgeDeletedLocally('entry', { id: 'e2', name: 'Biscuit' });
    expect(entryIds()).toEqual(['e1', 'e3']);
  });

  it("dog: drops the dog and the dog's entries", async () => {
    await purgeDeletedLocally('dog', { id: 'd1', name: 'Biscuit' });

    expect(spies.dogsDelete).toHaveBeenCalledWith('d1');
    expect(spies.entriesBatchDelete).toHaveBeenCalledWith(['e1', 'e3']);
    expect(entryIds()).toEqual(['e2']);
  });

  it('club: drops the club and clears it as the selected club', async () => {
    await purgeDeletedLocally('club', { id: 'k1', name: 'Heartland KC' });

    expect(spies.clubsDelete).toHaveBeenCalledWith('k1');
    expect(useClubStore.getState().clubs.map(c => c.id)).toEqual(['k2']);
    expect(useClubStore.getState().selectedClubId).toBe('');
  });

  it('never throws after a server success, and the lists still update', async () => {
    spies.classesBatchDelete.mockRejectedValue(new Error('IndexedDB is gone'));
    spies.entriesGetAll.mockRejectedValue(new Error('IndexedDB is gone'));
    spies.trialsBatchDelete.mockRejectedValue(new Error('IndexedDB is gone'));
    spies.clubsDelete.mockRejectedValue(new Error('IndexedDB is gone'));

    await expect(purgeDeletedLocally('trial', { id: 't1', name: 'T1' })).resolves.toBeUndefined();
    await expect(purgeDeletedLocally('club', { id: 'k1', name: 'K' })).resolves.toBeUndefined();

    expect(useTrialStore.getState().trials.map(t => t.id)).toEqual(['t2']);
    expect(useTrialStore.getState().trialClasses.t1).toBeUndefined();
    expect(useClubStore.getState().clubs.map(c => c.id)).toEqual(['k2']);
  });
});
