import { replicatedTrialsTable } from '@/services/replication';
import { deriveRegistryId } from '@/features/registries';

/**
 * Keep `trials.registry_id` consistent with the show's organization.
 *
 * Registry is show-wide (scoping §7) and stored denormalized on each trial (write-path
 * Phase 1). When a show's organization changes after its trials exist, the trials' stored
 * `registry_id` would otherwise drift from the new organization. This re-derives the
 * registry from the new organization and persists it onto every trial that's now out of
 * sync (skipping trials already correct, so a redundant call is a no-op).
 *
 * Returns the number of trials updated.
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
