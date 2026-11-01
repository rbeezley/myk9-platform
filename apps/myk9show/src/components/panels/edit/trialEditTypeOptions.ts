import { resolveTrialTypeOptions } from '@/components/shows/wizard/steps/TrialConfigurationStep.helpers';

/** Kept for a trial whose show organization is not known to the panel. */
const GENERIC_TRIAL_TYPES = [
  'Scent Work',
  'Agility',
  'Obedience',
  'Rally',
  'Conformation',
  'Other',
];

/**
 * The Trial Type choices in the edit panel: the show registry's own types (UKC Nosework,
 * ASCA Scent Detection, ...), plus the trial's current value when it is not among them
 * (a legacy "scent_work"), so opening and saving never blanks it.
 */
export function trialEditTypeOptions(
  organization: string | undefined,
  currentValue: string | undefined
): string[] {
  const base: string[] = organization
    ? resolveTrialTypeOptions(organization, [])
    : GENERIC_TRIAL_TYPES;
  return currentValue && !base.includes(currentValue) ? [currentValue, ...base] : base;
}
