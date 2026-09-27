import { buildTrialLabelCollisionDisambiguator } from '@/features/_shared/classLabel';
import { formatTrialIdentity } from './peopleRoster';

export interface TrialRingSource {
  trialId?: string | null | undefined;
  trialName?: string | null | undefined;
  trialNumber?: string | null | undefined;
  trialDate?: string | null | undefined;
}

/**
 * Resolves the People-at-show roster's "ring" (trial identity) label for a
 * set of classes, adding a numeric suffix ONLY to a trial whose
 * `formatTrialIdentity` label collides with another trial's on the same
 * calendar day (MYK9-842) -- `formatTrialIdentity` (MYK9-825) already
 * combines name and number so the ordinary same-day, same-name case stays
 * distinguishable; this only covers the residual case where that
 * combination ALSO collides (a genuine data duplicate).
 */
export function buildTrialRingResolver(
  sources: readonly TrialRingSource[]
): (source: TrialRingSource) => string | null {
  const seenTrialIds = new Set<string>();
  const trialIdentities: { trialId: string; trialDate?: string | null; label: string | null }[] =
    [];

  for (const source of sources) {
    if (!source.trialId || seenTrialIds.has(source.trialId)) continue;
    seenTrialIds.add(source.trialId);
    trialIdentities.push({
      trialId: source.trialId,
      trialDate: source.trialDate ?? null,
      label: formatTrialIdentity(source.trialName, source.trialNumber),
    });
  }

  const disambiguate = buildTrialLabelCollisionDisambiguator(trialIdentities);

  return source => {
    const base = formatTrialIdentity(source.trialName, source.trialNumber);
    if (!base || !source.trialId) return base;
    const suffix = disambiguate(source.trialId);
    return suffix ? `${base} #${suffix}` : base;
  };
}
