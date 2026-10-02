import {
  TrialType,
  formatTrialTypeLabel,
  getTrialTypesForOrganization,
} from '@/types/template.types';
import type { ReplicatedReadStatus } from '@/store/trial-store-types';
import { addDays, format, startOfDay } from 'date-fns';
import { parseWizardDay } from '@/utils/wizardTrialDates';

export { parseWizardDateTime, parseWizardDay } from '@/utils/wizardTrialDates';

/** Trials the wizard schedules per show day before suggesting the next day. */
const TRIALS_PER_DAY = 2;

/**
 * Default DATE for a newly added trial: the first SHOW day that
 * has fewer than two trials, else the show's last day. It reads only the show
 * dates and the trials already added, never the entry period (MYK9-884).
 */
export function getDefaultTrialDate(
  showStartDate: string | undefined,
  showEndDate: string | undefined,
  existingTrialDates: string[]
): string {
  const start = parseWizardDay(showStartDate) ?? startOfDay(new Date());
  const parsedEnd = parseWizardDay(showEndDate);
  const end = parsedEnd && parsedEnd >= start ? parsedEnd : undefined;
  const used = new Map<string, number>();
  for (const trialDate of existingTrialDates) {
    const day = parseWizardDay(trialDate);
    if (!day) continue;
    const key = format(day, 'yyyy-MM-dd');
    used.set(key, (used.get(key) ?? 0) + 1);
  }
  let chosen = end ?? start;
  // An open-ended range keeps advancing past the start; it terminates because
  // only finitely many days are full.
  for (let day = start; !end || day <= end; day = addDays(day, 1)) {
    if ((used.get(format(day, 'yyyy-MM-dd')) ?? 0) < TRIALS_PER_DAY) {
      chosen = day;
      break;
    }
  }
  // A calendar day only: the start time is its own field and is never defaulted.
  return format(chosen, 'yyyy-MM-dd');
}

interface TrialTypeTemplateOption {
  isActive?: boolean;
  organization?: string;
  trialType?: string;
}

export interface TrialCreationCopy {
  addTrialLabel: 'Add First Trial' | 'Add Another Trial' | 'Add Trial';
  emptyStateTitle: 'Schedule Your Trials' | 'Add Another Trial' | 'Add a Trial';
  emptyStateDescription: string;
}

/**
 * @param existingTrialsKnown false while Add Trials mode has not yet confirmed
 *   the show's current trials: the copy then claims neither "first" nor
 *   "another", since a show that looks empty may not be (MYK9-758).
 */
export function getTrialCreationCopy(
  hasAnyTrials: boolean,
  existingTrialsKnown = true
): TrialCreationCopy {
  if (!existingTrialsKnown) {
    return {
      addTrialLabel: 'Add Trial',
      emptyStateTitle: 'Add a Trial',
      emptyStateDescription:
        "You can add a trial as soon as this show's current trials have loaded.",
    };
  }

  if (!hasAnyTrials) {
    return {
      addTrialLabel: 'Add First Trial',
      emptyStateTitle: 'Schedule Your Trials',
      emptyStateDescription:
        'Trials are individual competition events within your show. Add your first trial to get started.',
    };
  }

  return {
    addTrialLabel: 'Add Another Trial',
    emptyStateTitle: 'Add Another Trial',
    emptyStateDescription: 'Add another trial to continue setting up this show.',
  };
}

export function isTrialSnapshotReady(
  readStatus: ReplicatedReadStatus,
  hasConfirmedSnapshot: boolean
): boolean {
  return hasConfirmedSnapshot && readStatus !== 'idle' && readStatus !== 'loading';
}

function normalizeTrialTypeOption(trialType: string | undefined): TrialType | undefined {
  if (!trialType) return undefined;
  const label = formatTrialTypeLabel(trialType);
  return Object.values(TrialType).includes(label as TrialType) ? (label as TrialType) : undefined;
}

export function resolveTrialTypeOptions(
  organization: string,
  templates: TrialTypeTemplateOption[]
): TrialType[] {
  const mappedTypes = getTrialTypesForOrganization(organization);
  const templateTypes = templates
    .filter(t => t.isActive && t.organization === organization)
    .map(t => normalizeTrialTypeOption(t.trialType))
    .filter((type): type is TrialType => Boolean(type));

  const ordered = [...mappedTypes.filter(type => type !== TrialType.OTHER), ...templateTypes];
  return [...new Set(ordered), TrialType.OTHER];
}
