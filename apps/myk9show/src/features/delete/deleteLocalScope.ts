/**
 * What a delete (or its Undo) reaches on this device, resolved ONCE per item so
 * every local store is purged from the same answer. The cascade mirrors the
 * `soft_delete_*` RPCs (migration 20261001214300):
 *   show   -> its trials, their classes, and entries by show_id OR by those classes
 *   trial  -> its classes, and entries by trial_id OR by those classes
 *   class  -> its entries
 *   dog    -> its entries (any show)
 *   entry, club, person -> themselves only
 */
import { logger } from '@/services/LoggingService';
import { replicatedClassesTable, replicatedTrialsTable } from '@/services/replication';
import { useTrialStore } from '@/store/trialStore';
import type { DeleteObjectKind, DeleteTarget } from './deleteTypes';

/** Never throws: the server delete already succeeded (see deleteLocalState.ts). */
export async function quietly(
  step: string,
  id: string,
  run: () => Promise<unknown> | unknown
): Promise<void> {
  try {
    await run();
  } catch (error) {
    logger.warn('Local delete reconcile step failed; the server result stands', 'delete', {
      step,
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export interface LocalScope {
  showIds: ReadonlySet<string>;
  trialIds: ReadonlySet<string>;
  classIds: ReadonlySet<string>;
  dogIds: ReadonlySet<string>;
  entryIds: ReadonlySet<string>;
  clubIds: ReadonlySet<string>;
  personIds: ReadonlySet<string>;
}

/** The fields an entry can be reached by, in either entry shape the stores hold. */
export interface ScopedEntry {
  id: string;
  classId?: string | undefined;
  showId?: string | undefined;
  trialId?: string | undefined;
  dogId?: string | undefined;
}

export function entryInScope(scope: LocalScope, entry: ScopedEntry): boolean {
  return (
    scope.entryIds.has(entry.id) ||
    (!!entry.showId && scope.showIds.has(entry.showId)) ||
    (!!entry.trialId && scope.trialIds.has(entry.trialId)) ||
    (!!entry.classId && scope.classIds.has(entry.classId)) ||
    (!!entry.dogId && scope.dogIds.has(entry.dogId))
  );
}

export async function resolveLocalScope(
  kind: DeleteObjectKind,
  target: DeleteTarget
): Promise<LocalScope> {
  const { id } = target;
  const showIds = new Set<string>();
  const trialIds = new Set<string>();
  const classIds = new Set<string>();
  const dogIds = new Set<string>();
  const entryIds = new Set<string>();
  const clubIds = new Set<string>();
  const personIds = new Set<string>();

  if (kind === 'show') {
    showIds.add(id);
    await quietly('scope:show-trials', id, async () => {
      for (const trial of await replicatedTrialsTable.getAllOrThrow()) {
        if (trial.showId === id) trialIds.add(trial.id);
      }
    });
    for (const trial of useTrialStore.getState().trials) {
      if (trial.showId === id) trialIds.add(trial.id);
    }
  }
  if (kind === 'trial') trialIds.add(id);
  if (kind === 'show' || kind === 'trial') {
    await quietly('scope:trial-classes', id, async () => {
      for (const cls of await replicatedClassesTable.getAllOrThrow()) {
        if (cls.trialId && trialIds.has(cls.trialId)) classIds.add(cls.id);
      }
    });
    // The trial store keys its classes by trial, so they count even if the replica read failed.
    const byTrial = useTrialStore.getState().trialClasses;
    for (const trialId of trialIds) for (const cls of byTrial[trialId] ?? []) classIds.add(cls.id);
  }
  if (kind === 'class') classIds.add(id);
  if (kind === 'dog') dogIds.add(id);
  if (kind === 'entry') entryIds.add(id);
  if (kind === 'club') clubIds.add(id);
  if (kind === 'person') personIds.add(id);

  return { showIds, trialIds, classIds, dogIds, entryIds, clubIds, personIds };
}
