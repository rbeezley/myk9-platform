/**
 * Per-element level lookup — the registry-backed replacement for `sport_templates.levels`.
 *
 * `sport_templates.levels` is ONE flat list per sport, but level sets vary PER ELEMENT:
 *   - UKC's grid elements run Novice/Advanced/Superior/Master/Elite, while Handler
 *     Discrimination runs Novice/Advanced/Excellent/Master (rulebook Ch. 11 §2 — four HD
 *     classes: NHD, AHD, EHD, MHD). "Excellent" is not in the flat column at all.
 *   - AKC "Detective" is a standalone element whose only level is its own name.
 *
 * The flat column holds the GRID elements' level set, and that is deliberate — it is what the
 * show wizard offers, and `src/test/database/registryDbParityContract.test.ts` asserts it. So
 * the column is not wrong; reading it as if it were the whole sport is. Anything that needs a
 * level list for a specific element must come through here.
 *
 * Principle: docs/design_handoff_heritage/Multi-Registry Scoping.md §8.
 */

import { getRegistry, getSport } from './lookup';
import type { RegistryId, RegistrySport } from './types';

/** The `sport_templates` row fields needed to find the matching registry config. */
export interface SportTemplateLike {
  sport_code?: string | null;
}

/**
 * `sport_templates.sport_code` → the registry + sport key that models it.
 *
 * Every configured sport is the scent-sport family, which the registry layer keys
 * 'scent-work' regardless of the registry's own name for it (UKC calls it Nosework, ASCA
 * Scent Detection). A template whose code is absent here has no registry config — callers
 * fall back to the flat column.
 */
const SPORT_CODE_TO_REGISTRY_SPORT: Readonly<
  Record<string, { registry: RegistryId; sport: string }>
> = {
  'akc-scent-work': { registry: 'AKC', sport: 'scent-work' },
  'ukc-nosework': { registry: 'UKC', sport: 'scent-work' },
  'asca-scent-detection': { registry: 'ASCA', sport: 'scent-work' },
};

/** The registry sport config for a seeded template, or null when the sport isn't modeled. */
export function getRegistrySportForTemplate(
  template: SportTemplateLike | null | undefined
): RegistrySport | null {
  const code = template?.sport_code?.trim();
  const match = code ? SPORT_CODE_TO_REGISTRY_SPORT[code] : undefined;
  if (!match) return null;
  return getSport(getRegistry(match.registry), match.sport);
}

/** Level labels in progression order; restricted to `levelKeys` when given, else the whole sport. */
function labelsInOrder(sport: RegistrySport, levelKeys?: ReadonlySet<string>): string[] {
  return [...sport.levels]
    .sort((a, b) => a.order - b.order)
    .filter(level => !levelKeys || levelKeys.has(level.key))
    .map(level => level.label);
}

/**
 * Level labels offered by the given elements, in progression order.
 *
 * An empty/omitted `elementLabels` returns every level the sport uses — the right answer when
 * no element is in scope yet (e.g. a form where the user hasn't picked one). An element label
 * with no registry entry contributes the sport's full set rather than nothing: an unrecognised
 * element must never silently narrow the options.
 */
export function levelLabelsForElements(
  sport: RegistrySport,
  elementLabels?: readonly string[]
): string[] {
  if (!elementLabels || elementLabels.length === 0) return labelsInOrder(sport);

  const keys = new Set<string>();
  for (const label of elementLabels) {
    const element = sport.elements.find(e => e.label === label);
    // Unknown element — widen to the whole sport rather than returning an empty list.
    if (!element) return labelsInOrder(sport);
    for (const key of element.levels) keys.add(key);
  }
  return labelsInOrder(sport, keys);
}

/** Resolves the level labels valid for a set of element labels. */
export type LevelsForElements = (elementLabels: readonly string[]) => readonly string[];

/**
 * A level resolver for a seeded template: registry-backed when the sport is configured,
 * otherwise the template's own flat column (which is all an unmodeled org has).
 */
export function levelResolverForTemplate(
  template: SportTemplateLike | null | undefined,
  fallbackLevels: readonly string[]
): LevelsForElements {
  const sport = getRegistrySportForTemplate(template);
  if (!sport) return () => fallbackLevels;
  return elementLabels => levelLabelsForElements(sport, elementLabels);
}
