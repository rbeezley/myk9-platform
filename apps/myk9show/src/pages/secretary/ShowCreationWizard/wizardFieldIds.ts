/**
 * Element ids of the wizard controls that can carry a field error. A validation
 * issue names the control it belongs to by this id; the control, its label and
 * its error callout all derive from it (see `components/forms/FieldError`).
 */
export const SHOW_FIELD = {
  name: 'show-name',
  organization: 'show-organization',
  dates: 'show-dates',
  location: 'show-location',
  hostClub: 'show-host-club',
  chair: 'official-chair-trigger',
  secretary: 'official-secretary-trigger',
  juniorHandlerFee: 'show-junior-handler-fee',
  entryPeriod: 'show-entry-period',
} as const;

export type TrialField = 'name' | 'trialType' | 'dateTime' | 'startTime' | 'eventNumber';

export function trialFieldId(trialId: string, field: TrialField): string {
  // The trial-type select has always carried the id suffix `-type`.
  return `trial-${trialId}-${field === 'trialType' ? 'type' : field}`;
}

/** A trial that still has no class on the Classes step. */
export function trialClassesFieldId(trialId: string): string {
  return `class-trial-${trialId}`;
}
