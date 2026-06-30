/**
 * Derivations over a registry's `scent-work` sport. These let consumers (premium class
 * ordering, the entry blank, …) read the level/element structure FROM the registry instead
 * of keeping their own hardcoded copies. Phase 1 of the multi-registry plan
 * (docs/plan-multi-registry-scent-work.md).
 */
import { getRegistry, getSport } from './lookup';
import type { ElementSpec, LevelSpec, RegistryId, RegistrySport } from './types';

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

/**
 * Progression level labels offered by the grid (column) elements, in order — e.g. AKC
 * `['Novice', 'Advanced', 'Excellent', 'Master']`. Excludes single-level non-grid elements
 * like Detective. Used for the entry-blank §II grid rows.
 */
export function scentWorkGridLevelLabels(sport: RegistrySport): string[] {
  const gridLevelKeys = new Set<string>();
  for (const el of sport.elements) {
    if (el.grid) for (const key of el.levels) gridLevelKeys.add(key);
  }
  return levelsByOrder(sport)
    .filter(l => gridLevelKeys.has(l.key))
    .map(l => l.label);
}

/** Grid (column) element display labels — `gridLabel ?? label` (AKC pluralizes). */
export function scentWorkGridElementLabels(sport: RegistrySport): string[] {
  return sport.elements.filter(e => e.grid).map(e => e.gridLabel ?? e.label);
}

/** Non-grid ("special") element labels, e.g. `['Handler Discrimination', 'Detective']`. */
export function scentWorkSpecialElementLabels(sport: RegistrySport): string[] {
  return sport.elements.filter(e => !e.grid).map(e => e.label);
}

/**
 * One generated class skeleton — the canonical (element, level, section) identity plus the
 * formatted display name. Carries structure only; per-registry rule detail (time limits,
 * hide counts, fee defaults) is attached by the registry-specific generator that consumes this.
 */
export interface ScentWorkClassSkeleton {
  /** Canonical element label (e.g. 'Container', 'Handler Discrimination'). */
  element: string;
  /** Canonical level label (e.g. 'Novice', 'Master'). Omitted for standalone classes (Detective). */
  level?: string;
  /** Section/variant key stored in `classes.section` (e.g. 'A', 'B'). Omitted when none. */
  section?: string;
  /** Display name: '<element> <level>[ <section>]', or just '<element>' when standalone. */
  className: string;
}

/** Levels an element offers, in progression order. */
function levelsForElement(sport: RegistrySport, el: ElementSpec): LevelSpec[] {
  const offered = new Set(el.levels);
  return levelsByOrder(sport).filter(l => offered.has(l.key));
}

/**
 * Generate the canonical class catalog for a registry's scent-work sport by walking
 * `elements × element.levels × variantsByLevel`. The single source of truth for "which scent
 * classes exist" — replaces per-registry hardcoded generators. Standalone elements (a single
 * level whose label matches the element, e.g. AKC Detective) render as just the element name
 * with no level. Phase 2 of the multi-registry plan.
 */
export function generateScentWorkClasses(sport: RegistrySport): ScentWorkClassSkeleton[] {
  const out: ScentWorkClassSkeleton[] = [];
  for (const el of sport.elements) {
    for (const level of levelsForElement(sport, el)) {
      const standalone = el.levels.length === 1 && level.label === el.label;
      const variants = el.variantsByLevel?.[level.key] ?? [];
      if (variants.length === 0) {
        // Standalone (e.g. Detective) renders as just the element name, no level.
        out.push(
          standalone
            ? { element: el.label, className: el.label }
            : { element: el.label, level: level.label, className: `${el.label} ${level.label}` }
        );
      } else {
        for (const variant of variants) {
          out.push({
            element: el.label,
            level: level.label,
            section: variant.key,
            className: `${el.label} ${level.label} ${variant.label}`,
          });
        }
      }
    }
  }
  return out;
}
