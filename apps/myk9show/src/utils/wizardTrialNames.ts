import { format } from 'date-fns';
import { formatDateLocal, parseLocalDateString } from '@/utils/dateLocal';

export interface TrialNameSource {
  id?: string | undefined;
  trialDate: string;
  name?: string | undefined;
  nameOverride?: string | undefined;
}

export interface WizardTrialView {
  /** Effective draft labels keyed by stable wizard trial id. */
  effectiveNamesByTrialId: ReadonlyMap<string, string>;
  /** Persisted trials already belonging to this show. */
  persistedTrialCount: number;
  /** True when this show has persisted trials or the wizard already has drafts. */
  hasAnyTrials: boolean;
}

/** Resolve a trial's calendar day without shifting date-only/local wall times. */
export function getTrialLocalDay(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const explicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  if (!explicitZone && /^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10);

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : formatDateLocal(parsed);
}

/**
 * Return the explicit/persisted name when present, otherwise derive the default
 * from same-day persisted trials and the preceding same-day drafts.
 */
export function getEffectiveTrialName(
  trial: TrialNameSource,
  persistedTrials: readonly TrialNameSource[],
  draftTrials: readonly TrialNameSource[]
): string {
  if (trial.nameOverride !== undefined) return trial.nameOverride;
  if (trial.name !== undefined) return trial.name;

  const day = getTrialLocalDay(trial.trialDate);
  const trialDate = parseLocalDateString(day);
  const dayName = trialDate ? format(trialDate, 'EEEE') : 'Trial';
  const persistedCount = persistedTrials.filter(
    candidate => getTrialLocalDay(candidate.trialDate) === day
  ).length;
  const trialIndex = draftTrials.findIndex(candidate => candidate.id === trial.id);
  const precedingDraftCount = draftTrials
    .slice(0, trialIndex < 0 ? 0 : trialIndex)
    .filter(candidate => getTrialLocalDay(candidate.trialDate) === day).length;

  return `${dayName} Trial ${persistedCount + precedingDraftCount + 1}`;
}

export function getEffectiveTrialNames(
  draftTrials: readonly TrialNameSource[],
  persistedTrials: readonly TrialNameSource[] = []
): string[] {
  return draftTrials.map(trial => getEffectiveTrialName(trial, persistedTrials, draftTrials));
}

/** Build the single naming/copy snapshot consumed by every wizard surface. */
export function createWizardTrialView(
  draftTrials: readonly (TrialNameSource & { id: string })[],
  persistedTrials: readonly TrialNameSource[]
): WizardTrialView {
  const effectiveNames = getEffectiveTrialNames(draftTrials, persistedTrials);

  return {
    effectiveNamesByTrialId: new Map(
      draftTrials.map((trial, index) => [trial.id, effectiveNames[index] ?? ''])
    ),
    persistedTrialCount: persistedTrials.length,
    hasAnyTrials: persistedTrials.length > 0 || draftTrials.length > 0,
  };
}
