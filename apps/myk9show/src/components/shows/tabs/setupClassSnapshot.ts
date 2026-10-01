import { hydrateThenResolve } from '@/utils/hydrateThenResolve';
import { replicatedClassesTable, replicatedTrialsTable } from '@/services/replication';
import {
  mapDatabaseToClass,
  mapReplicatedClassToDbRow,
  type DbClassWithRelations,
} from '@/services/mappers/classMappers';
import { useTrialStore } from '@/store/trialStore';

/**
 * The class a Setup row action works on: the SAME editor shape (`mapDatabaseToClass`) Class
 * Details gives `ClassEditPanel`, so status casing, judge, dates and numbers all match.
 */
export type SetupClassSnapshot = ReturnType<typeof mapDatabaseToClass>;

export interface SetupClassAction {
  action: 'edit' | 'delete';
  classSnapshot: SetupClassSnapshot;
  /** The class's trial, for cache invalidation. */
  trialId: string;
  /** The request that started this action; a stale completion must not clear a newer one. */
  requestId: number;
}

/**
 * Read one class from the authenticated replica and map it exactly the way the class queries
 * do (`mapReplicatedClassToDbRow` then `mapDatabaseToClass`). The replica keeps DB values
 * (`in_progress`); the editor needs the mapped shape (`In Progress`), and the per-trial store
 * (`trialStore.trialClasses`) is a lossy summary that has neither.
 */
async function readClassFromReplica(
  classId: string,
  trialId: string
): Promise<SetupClassSnapshot | null> {
  const cls = await replicatedClassesTable.getClassById(classId);
  if (!cls) return null;
  const trial = await replicatedTrialsTable.getTrialById(cls.trialId ?? trialId);
  const trialObj = trial
    ? {
        id: trial.id,
        name: trial.name,
        date: trial.date,
        ...(trial.trialNumber != null && { trialNumber: trial.trialNumber }),
        ...(trial.status != null && { status: trial.status }),
      }
    : null;
  return mapDatabaseToClass(
    mapReplicatedClassToDbRow(cls, { trial: trialObj }) as unknown as DbClassWithRelations
  );
}

/**
 * Resolve the class for a Setup row action, BEFORE any dialog mounts, from the authenticated
 * replica only (the same source the editor saves through), hydrating it first when it is not
 * there. Resolves `null` when it is still absent; the caller says so and stops. Deliberately NOT
 * the public by-id read: it carries no judge assignment, so an editor seeded from it would see
 * an unassigned class.
 */
export async function resolveSetupClass(
  classId: string,
  trialId: string
): Promise<SetupClassSnapshot | null> {
  return hydrateThenResolve({
    readStore: () => readClassFromReplica(classId, trialId),
    sync: () => replicatedClassesTable.sync(trialId, { forceFullSync: true }),
    reload: () => useTrialStore.getState().loadTrialClasses(),
  });
}
