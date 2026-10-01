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

const ids = (set: ReadonlySet<string>): string[] => [...set];

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
    // purgeDeletedShow drops the shows replica row and the show store copy.
    purge: async scope => {
      for (const id of scope.showIds) await useShowStore.getState().purgeDeletedShow(id);
    },
    restore: async () => {
      await replicatedShowsTable.sync('');
      await useShowStore.getState().loadShows();
    },
  },
  trials: {
    purge: async (scope, id) => {
      const gone = scope.trialIds;
      if (gone.size === 0) return;
      await quietly('trials:replica', id, () => replicatedTrialsTable.batchDelete(ids(gone)));
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
    purge: async (scope, id) => {
      const gone = scope.classIds;
      if (gone.size === 0) return;
      await quietly('classes:replica', id, () => replicatedClassesTable.batchDelete(ids(gone)));
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
      let replicaIds: string[] = [];
      await quietly('entries:replica', id, async () => {
        const rows = await replicatedEntriesTable.getAllOrThrow();
        replicaIds = rows.filter(row => entryInScope(scope, row)).map(row => row.id);
        if (replicaIds.length > 0) await replicatedEntriesTable.batchDelete(replicaIds);
      });
      // A directly-targeted entry is in scope even if the replica read failed.
      const inScope = (entry: { id: string }) =>
        entryInScope(scope, entry as Parameters<typeof entryInScope>[1]) ||
        replicaIds.includes(entry.id);
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
      for (const dogId of scope.dogIds) {
        await quietly('dogs:replica', id, () => replicatedDogsTable.delete(dogId));
      }
    },
    restore: async ({ target }) => {
      await quietly('dogs:sync', target.id, () => replicatedDogsTable.sync(''));
    },
  },
  clubs: {
    purge: async (scope, id) => {
      for (const clubId of scope.clubIds) {
        await quietly('clubs:replica', id, () => replicatedClubsTable.delete(clubId));
      }
      useClubStore.setState(state => ({
        clubs: state.clubs.filter(club => !scope.clubIds.has(club.id)),
        selectedClubId: scope.clubIds.has(state.selectedClubId) ? '' : state.selectedClubId,
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
