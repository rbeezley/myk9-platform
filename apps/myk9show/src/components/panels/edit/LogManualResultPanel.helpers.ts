import { levelResolverForTemplate } from '@/features/registries/elementLevels';
import type { SportTemplateRow } from '@/types/sport-template-types';

/**
 * Level options for the Log Manual Result panel's Level select. Reads the registry config per
 * element rather than the flat `levels` column — see `@/features/registries/elementLevels` for
 * why. An empty `element` means nothing to scope by yet, so the sport's full set is offered.
 */
export function levelOptionsForTemplate(
  template: Pick<SportTemplateRow, 'sport_code' | 'levels'> | null,
  element: string
): readonly string[] {
  if (!template) return [];
  return levelResolverForTemplate(template, template.levels)(element ? [element] : []);
}
