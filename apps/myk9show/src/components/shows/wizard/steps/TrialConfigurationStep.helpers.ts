import {
  TrialType,
  formatTrialTypeLabel,
  getTrialTypesForOrganization,
} from '@/types/template.types';
import type { ReplicatedReadStatus } from '@/store/trial-store-types';

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
