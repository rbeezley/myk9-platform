import type { RegistryId } from '@/features/registries';
import type { GeneratedPremium } from '@/types/premium-types';

/** One judge of a trial as every style prints the name line (MYK9-2292 adds the affiliation). */
export interface PremiumTrialJudgeFact {
  name: string;
  residence: string | null;
  /** ASCA §1.5.7: the judge's affiliation; null on every other registry's premium. */
  affiliation: string | null;
  classes: string[];
}

/**
 * A trial's judges as printed. The affiliation is ASCA only: another registry's premium never
 * prints one typed on the judge. Only the classes this trial runs, in its own progression order.
 */
export function buildTrialJudgeFacts(
  judges: GeneratedPremium['trials'][number]['judges'] | undefined,
  classLabels: readonly string[],
  registry: RegistryId
): PremiumTrialJudgeFact[] {
  return (judges ?? []).map(j => ({
    name: j.name,
    residence: j.residence?.trim() || null,
    affiliation: registry === 'ASCA' ? j.affiliation?.trim() || null : null,
    classes: [...new Set(classLabels.filter(label => (j.classes ?? []).includes(label)))],
  }));
}
