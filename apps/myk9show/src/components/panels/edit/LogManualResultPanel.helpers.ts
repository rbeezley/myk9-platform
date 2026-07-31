import { levelResolverForTemplate } from '@/features/registries/elementLevels';
import type { SportTemplateRow } from '@/types/sport-template-types';

/**
 * Level options for the Log Manual Result panel's Level select. Reads the registry config per
 * element rather than the flat `levels` column — see `@/features/registries/elementLevels` for
 * why.
 *
 * With no element chosen the options span the template's OWN elements, not the registry's full
 * level vocabulary. The registry carries levels that no seeded class uses — ASCA "Champion" is
 * a real level held back from `sport_templates` deliberately (it is titling/invitational, not a
 * scheduled class; see 20260701130000). Offering it would let a result be saved against a level
 * with no class and no title to credit it.
 */
export function levelOptionsForTemplate(
  template: Pick<SportTemplateRow, 'sport_code' | 'levels' | 'elements'> | null,
  element: string
): readonly string[] {
  if (!template) return [];
  const scope = element ? [element] : template.elements;
  return levelResolverForTemplate(template, template.levels)(scope);
}
