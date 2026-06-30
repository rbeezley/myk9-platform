/**
 * Derivations over a registry's `scent-work` sport. These let consumers (premium class
 * ordering, the entry blank, …) read the level/element structure FROM the registry instead
 * of keeping their own hardcoded copies. Phase 1 of the multi-registry plan
 * (docs/plan-multi-registry-scent-work.md).
 */
import { getRegistry, getSport } from './lookup';
import type { LevelSpec, RegistryId, RegistrySport } from './types';

const SCENT_WORK = 'scent-work';

/** The `scent-work` sport for a registry. Throws (loudly) if the registry/sport is unconfigured. */
export function getScentWorkSport(registryId: RegistryId): RegistrySport {
  return getSport(getRegistry(registryId), SCENT_WORK);
}

function levelsByOrder(sport: RegistrySport): readonly LevelSpec[] {
  return [...sport.levels].sort((a, b) => a.order - b.order);
}

/** Variant labels for a level, unioned across all elements, order-preserving + deduped by key. */
function variantLabelsForLevel(sport: RegistrySport, levelKey: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const el of sport.elements) {
    for (const v of el.variantsByLevel?.[levelKey] ?? []) {
      if (!seen.has(v.key)) {
        seen.add(v.key);
        out.push(v.label);
      }
    }
  }
  return out;
}

/**
 * The ordered level-display list: for each level (by progression), its variant-expanded
 * forms first, then the base label. For AKC this reproduces the legacy hardcoded array
 * `['Novice A', 'Novice B', 'Novice', 'Advanced', 'Excellent', 'Master', 'Detective']`.
 */
export function scentWorkLevelOrder(sport: RegistrySport): string[] {
  const out: string[] = [];
  for (const level of levelsByOrder(sport)) {
    for (const variantLabel of variantLabelsForLevel(sport, level.key)) {
      out.push(`${level.label} ${variantLabel}`);
    }
    out.push(level.label);
  }
  return out;
}
