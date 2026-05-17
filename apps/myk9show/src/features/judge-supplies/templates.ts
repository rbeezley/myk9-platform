import type { RegistryId, SupplyTemplateItem } from './types';

const AKC: SupplyTemplateItem[] = [
  { label: 'Clipboard', sort: 10 },
  { label: 'Pens (2)', sort: 20 },
  { label: 'Highlighter', sort: 30 },
  { label: 'Stopwatch / timer', sort: 40 },
  { label: 'Bottled water', sort: 50 },
  { label: 'Hand sanitizer', sort: 60 },
  { label: 'Treats jar (judge-supplied)', sort: 70 },
  { label: 'Trash bag', sort: 80 },
  { label: 'Class rulebook', sort: 90 },
  { label: 'Judge lunch ticket', sort: 100 },
];

const UKC: SupplyTemplateItem[] = [
  { label: 'Clipboard', sort: 10 },
  { label: 'Pens (2)', sort: 20 },
  { label: 'Stopwatch / timer', sort: 30 },
  { label: 'Bottled water', sort: 40 },
  { label: 'Hand sanitizer', sort: 50 },
  { label: 'Treats jar (judge-supplied)', sort: 60 },
  { label: 'Class rulebook', sort: 70 },
  { label: 'Judge lunch ticket', sort: 80 },
];

const DEFAULT_TEMPLATE: SupplyTemplateItem[] = [
  { label: 'Clipboard', sort: 10 },
  { label: 'Pens (2)', sort: 20 },
  { label: 'Bottled water', sort: 30 },
  { label: 'Class rulebook', sort: 40 },
];

const TEMPLATES: Record<string, SupplyTemplateItem[]> = {
  AKC,
  UKC,
};

export function getSupplyTemplate(registryId: RegistryId | null | undefined): SupplyTemplateItem[] {
  if (!registryId) return DEFAULT_TEMPLATE;
  return TEMPLATES[registryId] ?? DEFAULT_TEMPLATE;
}

export const KNOWN_REGISTRY_IDS = Object.keys(TEMPLATES);
