import { TrialType, formatTrialTypeLabel, getTrialTypesForOrganization } from '@/types/template.types';

interface TrialTypeTemplateOption {
  isActive?: boolean;
  organization?: string;
  trialType?: string;
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
