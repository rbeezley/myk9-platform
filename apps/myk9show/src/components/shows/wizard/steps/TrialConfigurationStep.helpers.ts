import {
  TrialType,
  formatTrialTypeLabel,
  getTrialTypesForOrganization,
} from '@/types/template.types';
import { format } from 'date-fns';
import { parseLocalDateString } from '@/utils/dateLocal';
import type { ReplicatedReadStatus } from '@/store/trial-store-types';

interface TrialTypeTemplateOption {
  isActive?: boolean;
  organization?: string;
  trialType?: string;
}

export interface TrialNameSource {
  trialDate: string;
  name: string;
}

export interface TrialCreationCopy {
  addTrialLabel: 'Add First Trial' | 'Add Another Trial';
  emptyStateTitle: 'Schedule Your Trials' | 'Add Another Trial';
  emptyStateDescription: string;
}

function dateOnly(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : format(parsed, 'yyyy-MM-dd');
}

export function getTrialCreationCopy(
  existingTrials: readonly TrialNameSource[],
  selectedDate?: string
): TrialCreationCopy {
  const normalizedSelectedDate = selectedDate ? dateOnly(selectedDate) : '';
  const hasTrialOnSelectedDate = normalizedSelectedDate
    ? existingTrials.some(trial => dateOnly(trial.trialDate) === normalizedSelectedDate)
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

export function getNextTrialName(
  existingTrials: readonly TrialNameSource[],
  selectedDate: string
): string {
  const normalizedDate = dateOnly(selectedDate);
  const trialDate = parseLocalDateString(normalizedDate);
  const dayName = trialDate ? format(trialDate, 'EEEE') : 'Trial';
  const sameDayTrials = existingTrials.filter(
    trial => dateOnly(trial.trialDate) === normalizedDate
  );
  const namePattern = new RegExp(`^${dayName} trial (\\d+)$`, 'i');
  const occupiedNumbers = new Set<number>();
  let customNameCount = 0;

  for (const trial of sameDayTrials) {
    const match = namePattern.exec(trial.name.trim());
    if (match) occupiedNumbers.add(Number(match[1]));
    else customNameCount += 1;
  }

  // Custom names still occupy a same-day slot; reserve the earliest unused
  // numbers for them, then select the earliest remaining number for this trial.
  for (let reserved = 0; reserved < customNameCount; reserved += 1) {
    let number = 1;
    while (occupiedNumbers.has(number)) number += 1;
    occupiedNumbers.add(number);
  }

  let trialNumber = 1;
  while (occupiedNumbers.has(trialNumber)) trialNumber += 1;

  return `${dayName} Trial ${trialNumber}`;
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
