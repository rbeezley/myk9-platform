/**
 * THE declared list of local stores a delete reaches, per object kind. Every
 * "this record is gone on the server" outcome (deleted, already deleted) and
 * every Undo is driven from `LOCAL_STORES_BY_KIND` by `deleteLocalState.ts`, so
 * a store missing here is missing everywhere and the table-driven test
 * (`deleteLocalState.test.ts`) fails on it. Do not pick stores per outcome.
 *
 * A "store" is one entity's local copies together: its replica (IndexedDB) plus
 * every Zustand/directory store that holds it. The cascade each kind reaches is
 * `soft_delete_*` in migration 20261001214300.
 */
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
import { entryInScope, quietly, type LocalScope } from './deleteLocalScope';
import { purgeCleanRows } from './deleteLocalWork';
import type { DeleteObjectKind, DeleteTarget } from './deleteTypes';

export type LocalStoreName =
  'shows' | 'trials' | 'classes' | 'entries' | 'dogs' | 'clubs' | 'people';

export const LOCAL_STORES_BY_KIND: Record<DeleteObjectKind, readonly LocalStoreName[]> = {
  show: ['shows', 'trials', 'classes', 'entries'],
  trial: ['trials', 'classes', 'entries'],
  class: ['classes', 'entries'],
  entry: ['entries'],
  dog: ['dogs', 'entries'],
  club: ['clubs'],
  person: ['people'],
};

/**
 * React Query roots a delete or an Undo of each kind must invalidate: the other
 * half of the same per-kind declaration. `deleteRecords.invalidateAfterDelete`
 * (delete AND Undo) reads this and nothing else. Every kind that reaches
 * `'entries'` above must name every root a query holding entries lives under
 * (`deleteQueryRoots.test.ts` derives them from the `queryKeys` factories), so
 * one entry-bearing family cannot go stale after Undo while another refreshes.
 */
const ENTRY_QUERY_ROOTS = ['entries', 'shows', 'trials', 'classes'] as const;

export const QUERY_ROOTS_BY_KIND: Record<DeleteObjectKind, readonly string[]> = {
  club: ['clubs', 'shows'],
  show: [...ENTRY_QUERY_ROOTS, 'clubs'],
  trial: ENTRY_QUERY_ROOTS,
  class: ENTRY_QUERY_ROOTS,
  entry: [...ENTRY_QUERY_ROOTS, 'dogs'],
  dog: [...ENTRY_QUERY_ROOTS, 'dogs', 'users', 'people'],
  person: ['users', 'people', 'dogs'],
};

interface RestoreInput {
  kind: DeleteObjectKind;
  target: DeleteTarget;
}

interface LocalStore {
  /** Drop everything in `scope` from this entity's replica and its Zustand copies. */
  purge: (scope: LocalScope, id: string) => Promise<void>;
  /** Bring the entity back after an Undo: re-sync what `purge` dropped. */
  restore: (input: RestoreInput) => Promise<void>;
}

/** Show scopes whose entries an Undo must re-read: the known show, else every show. */
async function entryShowScopes({ kind, target }: RestoreInput): Promise<string[]> {
  if (kind === 'show') return [target.id];
  if (target.context?.showId && kind !== 'dog') return [target.context.showId];
  return (await replicatedShowsTable.getAllOrThrow()).map(show => show.id);
}

/** Trials whose classes an Undo must re-read, after the trials replica is back. */
async function classTrialScopes({ kind, target }: RestoreInput): Promise<string[]> {
  if (kind === 'trial') return [target.id];
  if (kind === 'class') return target.context?.trialId ? [target.context.trialId] : [];
  const trials = await replicatedTrialsTable.getAllOrThrow();
  return trials.filter(trial => trial.showId === target.id).map(trial => trial.id);
}

export const LOCAL_STORES: Record<LocalStoreName, LocalStore> = {
  shows: {
    // The replica rows go atomically (clean ones only); the store copy then drops
    // exactly the deleted ids, as `purgeDeletedShow` would, without re-deleting a
    // replica row another tab may have just dirtied.
    purge: async scope => {
      if (scope.showIds.size === 0) return;
      const { deleted } = await purgeCleanRows(replicatedShowsTable, scope.showIds);
      if (deleted.size === 0) return;
      useShowStore.setState(state => ({
        shows: state.shows.filter(show => !deleted.has(show.id)),
        selectedShowId: deleted.has(state.selectedShowId) ? '' : state.selectedShowId,
      }));
    },
    restore: async () => {
      await replicatedShowsTable.sync('');
      await useShowStore.getState().loadShows();
    },
  },
  trials: {
    purge: async scope => {
      if (scope.trialIds.size === 0) return;
      const { deleted: gone } = await purgeCleanRows(replicatedTrialsTable, scope.trialIds);
      if (gone.size === 0) return;
      useTrialStore.setState(state => {
        const trialClasses = { ...state.trialClasses };
        for (const trialId of gone) delete trialClasses[trialId];
        return {
          trials: state.trials.filter(trial => !gone.has(trial.id)),
          trialClasses,
          selectedTrialId:
            state.selectedTrialId && gone.has(state.selectedTrialId) ? null : state.selectedTrialId,
        };
      });
    },
    restore: async ({ kind, target }) => {
      const showId = kind === 'show' ? target.id : target.context?.showId;
      if (showId) await quietly('trials:sync', target.id, () => replicatedTrialsTable.sync(showId));
      await quietly('trials:store', target.id, () => useTrialStore.getState().loadTrials());
    },
  },
  classes: {
    purge: async scope => {
      if (scope.classIds.size === 0) return;
      const { deleted: gone } = await purgeCleanRows(replicatedClassesTable, scope.classIds);
      if (gone.size === 0) return;
      useTrialStore.setState(state => ({
        trialClasses: Object.fromEntries(
          Object.entries(state.trialClasses).map(([trialId, classes]) => [
            trialId,
            classes.filter(cls => !gone.has(cls.id)),
          ])
        ),
      }));
      useClassStore.setState(state => ({
        classes: state.classes.filter(cls => !gone.has(cls.id)),
      }));
    },
    restore: async input => {
      const { id } = input.target;
      let trialIds: string[] = [];
      await quietly('classes:scopes', id, async () => {
        trialIds = await classTrialScopes(input);
      });
      await Promise.all(
        trialIds.map(trialId =>
          quietly('classes:sync', id, () => replicatedClassesTable.sync(trialId))
        )
      );
      await quietly('classes:trial-store', id, () => useTrialStore.getState().loadTrialClasses());
      await quietly('classes:class-store', id, () => useClassStore.getState().loadClasses());
    },
  },
  entries: {
    purge: async (scope, id) => {
      let deleted = new Set<string>();
      let kept = new Set<string>();
      let checked = false;
      await quietly('entries:replica', id, async () => {
        const rows = await replicatedEntriesTable.getAllOrThrow();
        const result = await purgeCleanRows(
          replicatedEntriesTable,
          rows.filter(row => entryInScope(scope, row)).map(row => row.id)
        );
        deleted = result.deleted;
        kept = result.kept;
        checked = true;
      });
      // A directly-targeted entry is in scope even if the replica read failed; an
      // entry holding local work is never dropped from a store copy either. If the
      // check itself failed, nothing is dropped from the store copies.
      const inScope = (entry: { id: string }) =>
        checked &&
        !kept.has(entry.id) &&
        (entryInScope(scope, entry as Parameters<typeof entryInScope>[1]) || deleted.has(entry.id));
      useEntryStore.setState(state => ({ entries: state.entries.filter(e => !inScope(e)) }));
      useClassStore.setState(state => ({ entries: state.entries.filter(e => !inScope(e)) }));
    },
    restore: async input => {
      const { kind, target } = input;
      if (kind === 'entry') replicatedEntriesTable.forgetServerDeletion(target.id);
      let showIds: string[] = [];
      await quietly('entries:scopes', target.id, async () => {
        showIds = await entryShowScopes(input);
      });
      await Promise.all(
        showIds.map(showId =>
          quietly('entries:sync', target.id, () => replicatedEntriesTable.sync(showId))
        )
      );
      await quietly('entries:store', target.id, () => useEntryStore.getState().loadEntries());
    },
  },
  dogs: {
    // dogStore.dogs is a deprecated no-op shim; the dogs replica is the dog directory.
    purge: async (scope, id) => {
      if (scope.dogIds.size === 0) return;
      await quietly('dogs:replica', id, () => purgeCleanRows(replicatedDogsTable, scope.dogIds));
    },
    restore: async ({ target }) => {
      await quietly('dogs:sync', target.id, () => replicatedDogsTable.sync(''));
    },
  },
  clubs: {
    purge: async scope => {
      if (scope.clubIds.size === 0) return;
      const { deleted: gone } = await purgeCleanRows(replicatedClubsTable, scope.clubIds);
      useClubStore.setState(state => ({
        clubs: state.clubs.filter(club => !gone.has(club.id)),
        selectedClubId: gone.has(state.selectedClubId) ? '' : state.selectedClubId,
      }));
    },
    restore: async ({ target }) => {
      await quietly('clubs:sync', target.id, () => replicatedClubsTable.sync());
      await quietly('clubs:store', target.id, () => useClubStore.getState().loadClubs());
    },
  },
  people: {
    // People are not replicated: the directory store IS the local copy.
    purge: async scope => {
      for (const personId of scope.personIds) useUserStore.getState().removeUser(personId);
    },
    restore: async ({ target }) => {
      await quietly('people:store', target.id, () => useUserStore.getState().loadPeople());
    },
  },
};
