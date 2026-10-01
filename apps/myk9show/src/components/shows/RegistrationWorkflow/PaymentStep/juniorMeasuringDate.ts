import { deriveRegistryId } from '@/features/registries';

/**
 * MYK9-879: the date a registry measures "under 18" on, in words. Nothing is
 * computed from it and no birth date is collected: it is only what the exhibitor
 * is told they are declaring.
 *
 *  - AKC Scent Work: under 18 on the day of the trial.
 *  - UKC Nosework (Ch.1 Sec.3): has not reached the 18th birthday as of January 1
 *    of the competition year, so the measuring date is fixed, not the trial date.
 *  - ASCA has no junior tier here and the control is hidden for it.
 *
 * The registry comes from the show's organization through the registry helper,
 * never a raw column read.
 */
export function juniorMeasuringDateText(organization: string | null | undefined): string {
  return deriveRegistryId(organization) === 'UKC'
    ? "as of January 1 of the competition year (the year of this trial), UKC's rule"
    : 'on the day of the trial';
}
