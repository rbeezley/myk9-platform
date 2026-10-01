import type { ClassData } from '@/components/classes/types/classTypes';
import { resolveClassFromStores } from '@/hooks/resolveClassFromStores';
import { getPublicClassById } from '@/services/database/classes';
import { useTrialStore } from '@/store/trialStore';
import type { SyncableTrialClass } from '@/store/trial-store-types';

/** The class a Setup row action works on, resolved once when the action starts. */
export type SetupClassSnapshot = ClassData | SyncableTrialClass;

export interface SetupClassAction {
  action: 'edit' | 'delete';
  classSnapshot: SetupClassSnapshot;
}

/**
 * Resolve the class for a Setup row action, BEFORE any dialog mounts: the replicated store
 * first (what Setup's rows come from when warm), else the by-id class read Class Details uses
 * for a cold session. Resolves `null` when neither has it; the caller says so and stops.
 */
export async function resolveSetupClass(classId: string): Promise<SetupClassSnapshot | null> {
  const replicated = resolveClassFromStores<SetupClassSnapshot>(
    classId,
    [],
    useTrialStore.getState().trialClasses
  );
  if (replicated) return replicated;
  try {
    return ((await getPublicClassById(classId)) as SetupClassSnapshot | null) ?? null;
  } catch {
    return null;
  }
}

/** The owning trial, when the snapshot carries it (a replicated trial class does not). */
export function snapshotTrialId(snapshot: SetupClassSnapshot): string | undefined {
  return 'trialId' in snapshot ? snapshot.trialId : undefined;
}
