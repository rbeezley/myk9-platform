import {
  TrialType,
  formatTrialTypeLabel,
  getTrialTypesForOrganization,
} from '@/types/template.types';
import { format } from 'date-fns';
import { parseLocalDateString } from '@/utils/dateLocal';

interface TrialTypeTemplateOption {
  isActive?: boolean;
  organization?: string;
  trialType?: string;
}

export interface TrialDateSource {
  trialDate: string;
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

export function getTrialCreationCopy(existingTrials: readonly TrialDateSource[]): TrialCreationCopy {
  if (existingTrials.length === 0) {
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

export function getDefaultTrialName(
  existingTrials: readonly TrialDateSource[],
  selectedDate: string
): string {
  const normalizedDate = dateOnly(selectedDate);
  const trialDate = parseLocalDateString(normalizedDate);
  const dayName = trialDate ? format(trialDate, 'EEEE') : 'Trial';
  const sameDayCount = existingTrials.filter(
    trial => dateOnly(trial.trialDate) === normalizedDate
  ).length;

  return `${dayName} Trial ${sameDayCount + 1}`;
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
