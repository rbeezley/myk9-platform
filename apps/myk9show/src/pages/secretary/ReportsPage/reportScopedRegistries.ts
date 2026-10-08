import { resolveConfiguredRegistryId, type RegistryId } from '@/features/registries';

export type TrialReportOption = {
  id: string;
  name: string;
  trial_number: string;
  date: string;
  registry_id?: string | null;
};

const KNOWN_REGISTRY_IDS: readonly RegistryId[] = ['AKC', 'UKC', 'ASCA'];

/**
 * The registries of the trial(s) the secretary is looking at, or `undefined`
 * (= leave the catalog unfiltered) when that cannot be said for certain.
 */
export function getScopedRegistryIds(
  trials: readonly TrialReportOption[],
  trialId: string
): RegistryId[] | undefined {
  if (trials.length === 0) return undefined;

  const scopedTrials = trialId === 'all' ? trials : trials.filter(trial => trial.id === trialId);
  if (scopedTrials.length === 0) return undefined;

  const ids = new Set<RegistryId>();
  for (const trial of scopedTrials) {
    const normalized = resolveConfiguredRegistryId(trial.registry_id);
    if (!normalized || !KNOWN_REGISTRY_IDS.includes(normalized)) {
      // An unexpected value should never hide a form. Leave the catalog
      // unfiltered until the data contract is corrected.
      return undefined;
    }
    ids.add(normalized);
  }
  return [...ids];
}
