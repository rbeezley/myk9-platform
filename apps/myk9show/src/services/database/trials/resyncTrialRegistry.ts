import { replicatedTrialsTable } from '@/services/replication';
import { deriveRegistryId } from '@/features/registries';

/**
 * Best-effort LOCAL resync of `trials.registry_id` to a show's organization.
 *
 * Registry is show-wide (scoping §7) and stored denormalized on each trial (write-path
 * Phase 1). When a show's organization changes, its trials' `registry_id` must follow.
 *
 * AUTHORITY LIVES IN THE DB, NOT HERE. This helper is replica-bound on both ends — it
 * reads the local IndexedDB replica (`getTrialsByShow`) and `updateTrial` only touches
 * trials present locally (it throws otherwise). So on a cold/incomplete replica it may
 * see no trials and do nothing. That is safe because the authoritative fix is the
 * `sync_trial_registry_from_show` DB trigger (migration 20260701120000): when the show's
 * organization change reaches the server, the trigger re-derives registry_id for EVERY
 * child trial regardless of any client's replica. This function just gives the editing
 * client immediate local consistency for the trials it already holds.
 *
 * Idempotent: skips trials already correct. Returns the number of local trials updated.
 */
export async function resyncTrialRegistry(
  showId: string,
  organization: string | null | undefined
): Promise<number> {
  const registryId = deriveRegistryId(organization);
  const trials = await replicatedTrialsTable.getTrialsByShow(showId);

  let updated = 0;
  for (const trial of trials) {
    if (trial.registryId !== registryId) {
      await replicatedTrialsTable.updateTrial(trial.id, { registryId });
      updated += 1;
    }
  }
  return updated;
}
