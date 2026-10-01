import { hydrateThenResolve } from '@/utils/hydrateThenResolve';
import { resolveClassFromStores } from '@/hooks/resolveClassFromStores';
import { replicatedClassesTable } from '@/services/replication';
import { useTrialStore } from '@/store/trialStore';
import type { SyncableTrialClass } from '@/store/trial-store-types';

/** The class a Setup row action works on, resolved once when the action starts. */
export type SetupClassSnapshot = SyncableTrialClass;

export interface SetupClassAction {
  action: 'edit' | 'delete';
  classSnapshot: SetupClassSnapshot;
  /** The class's trial (a replicated trial class does not carry it), for cache invalidation. */
  trialId: string;
}

const fromStore = (classId: string) =>
  resolveClassFromStores<SetupClassSnapshot>(classId, [], useTrialStore.getState().trialClasses);

/**
 * Resolve the class for a Setup row action, BEFORE any dialog mounts, from the authenticated
 * replicated store only (the same source the editor saves through). A class the store does not
 * hold yet is hydrated through the store's own load: sync that trial's classes into the
 * replica, reload the store, read again. Resolves `null` when it is still absent; the caller
 * says so and stops. Deliberately NOT the public by-id read: it carries no judge assignment, so
 * an editor seeded from it would see an unassigned class.
 */
export async function resolveSetupClass(
  classId: string,
  trialId: string
): Promise<SetupClassSnapshot | null> {
  return hydrateThenResolve({
    readStore: () => fromStore(classId),
    sync: () => replicatedClassesTable.sync(trialId, { forceFullSync: true }),
    reload: () => useTrialStore.getState().loadTrialClasses(),
  });
}
