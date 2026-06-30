/**
 * Derivations over a registry's `scent-work` sport. These let consumers (premium class
 * ordering, the entry blank, …) read the level/element structure FROM the registry instead
 * of keeping their own hardcoded copies. Phase 1 of the multi-registry plan
 * (docs/plan-multi-registry-scent-work.md).
 */
import { getRegistry, getSport } from './lookup';
import type { ClassVariant, ElementSpec, LevelSpec, RegistryId, RegistrySport } from './types';

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

/** A column in the entry-blank §II grid — one grid element. */
export interface ScentWorkGridColumn {
  /** Canonical element label, as stored in `classes.element` (e.g. 'Container'). For matching. */
  label: string;
  /** Display label shown on the printed grid (e.g. 'Containers'). */
  gridLabel: string;
}

/** A row in the entry-blank §II grid — a level, optionally a continuation variant of it. */
export interface ScentWorkGridRow {
  /** Display label for the row (e.g. 'Novice' or 'Novice Level C'). */
  label: string;
  /** Canonical level label, for matching a prefilled entry (e.g. 'Novice'). */
  level: string;
  /**
   * Continuation section key (e.g. 'C') when this row is a continuation variant; absent for a
   * base row. A base row matches entries whose section is NOT a continuation section.
   */
  section?: string;
}

export interface ScentWorkGrid {
  columns: ScentWorkGridColumn[];
  rows: ScentWorkGridRow[];
  /** Continuation section keys per level label — for base-row match exclusion. */
  continuationSectionsByLevel: Record<string, string[]>;
}

/**
 * Build the entry-blank §II grid (level rows × element columns) for a sport.
 *
 * Rows expand by CONTINUATION variants only: ASCA's "Level C" is its own row (a distinct class),
 * but AKC/UKC ownership A/B is NOT — the A/B distinction isn't a grid row, just a section on the
 * base level. Columns carry both the canonical element label (for matching `classes.element`) and
 * the display gridLabel (which may be pluralized).
 */
export function scentWorkGrid(sport: RegistrySport): ScentWorkGrid {
  const gridElements = sport.elements.filter(e => e.grid);
  const columns: ScentWorkGridColumn[] = gridElements.map(e => ({
    label: e.label,
    gridLabel: e.gridLabel ?? e.label,
  }));

  const gridLevelKeys = new Set<string>();
  for (const el of gridElements) for (const key of el.levels) gridLevelKeys.add(key);
  const gridLevels = levelsByOrder(sport).filter(l => gridLevelKeys.has(l.key));

  const rows: ScentWorkGridRow[] = [];
  const continuationSectionsByLevel: Record<string, string[]> = {};
  for (const level of gridLevels) {
    rows.push({ label: level.label, level: level.label }); // base row
    // Continuation variants for this level, unioned across grid elements (deduped by key).
    const seen = new Set<string>();
    const continuations: ClassVariant[] = [];
    for (const el of gridElements) {
      for (const v of el.variantsByLevel?.[level.key] ?? []) {
        if (v.kind === 'continuation' && !seen.has(v.key)) {
          seen.add(v.key);
          continuations.push(v);
        }
      }
    }
    continuationSectionsByLevel[level.label] = continuations.map(v => v.key);
    for (const v of continuations) {
      rows.push({ label: `${level.label} ${v.label}`, level: level.label, section: v.key });
    }
  }

  return { columns, rows, continuationSectionsByLevel };
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
 *
 * VARIANTS: a level's `variantsByLevel` entries are interpreted by `kind`. `ownership` variants
 * (AKC/UKC A/B) REPLACE the base class (no plain "Novice", only "Novice A"/"Novice B").
 * `continuation` variants (ASCA "Level C") are ADDITIVE — the base class is still emitted
 * alongside the variant (e.g. "Novice" + "Novice Level C").
 *
 * ORDER: classes are emitted in registry element order (`sport.elements`), then level
 * progression, then variant. For AKC this is Container → Interior → Exterior → Buried → HD →
 * Detective. This is an INTENTIONAL canonical change from the legacy generators' Interior-first
 * order — it makes the generated class list match the order already used by the entry-blank §II
 * grid (Phase 1b), so every surface derives element order from one place. Safe pre-launch (no
 * real class data). The ordered-catalog test pins this; downstream displayOrder follows it.
 */
export function generateScentWorkClasses(sport: RegistrySport): ScentWorkClassSkeleton[] {
  const out: ScentWorkClassSkeleton[] = [];
  for (const el of sport.elements) {
    for (const level of levelsForElement(sport, el)) {
      const standalone = el.levels.length === 1 && level.label === el.label;
      const variants = el.variantsByLevel?.[level.key] ?? [];
      // Variant kinds behave oppositely: `ownership` (AKC/UKC A/B) REPLACES the base class —
      // there is no plain "Novice", only "Novice A"/"Novice B". `continuation` (ASCA "Level C")
      // is ADDITIVE — the base "Novice" still exists alongside "Novice Level C". So emit the
      // base unless an ownership variant has replaced it.
      const hasOwnershipVariant = variants.some(v => v.kind === 'ownership');
      if (!hasOwnershipVariant) {
        // Standalone (e.g. Detective) renders as just the element name, no level.
        out.push(
          standalone
            ? { element: el.label, className: el.label }
            : { element: el.label, level: level.label, className: `${el.label} ${level.label}` }
        );
      }
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
  return out;
}
