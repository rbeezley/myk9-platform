import {
  TrialType,
  formatTrialTypeLabel,
  getTrialTypesForOrganization,
} from '@/types/template.types';
import { getTrialLocalDay, type TrialNameSource } from '@/utils/wizardTrialNames';
import type { ReplicatedReadStatus } from '@/store/trial-store-types';

interface TrialTypeTemplateOption {
  isActive?: boolean;
  organization?: string;
  trialType?: string;
}

export interface TrialCreationCopy {
  addTrialLabel: 'Add First Trial' | 'Add Another Trial';
  emptyStateTitle: 'Schedule Your Trials' | 'Add Another Trial';
  emptyStateDescription: string;
}

export function getTrialCreationCopy(
  existingTrials: readonly TrialNameSource[],
  selectedDate?: string
): TrialCreationCopy {
  const normalizedSelectedDate = selectedDate ? getTrialLocalDay(selectedDate) : '';
  const hasTrialOnSelectedDate = normalizedSelectedDate
    ? existingTrials.some(trial => getTrialLocalDay(trial.trialDate) === normalizedSelectedDate)
    : existingTrials.length > 0;

  if (!hasTrialOnSelectedDate) {
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
