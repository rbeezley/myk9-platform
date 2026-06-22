import type { RunOrderPreset as RingsideRunOrderPreset, RunOrderScope } from '@myk9/ringside';

/**
 * myK9Show exposes a deliberately narrower run-order preset surface than
 * the canonical `RunOrderPreset` in `@myk9/ringside` (which serves the
 * full myK9Q ringside flow). myK9Show's RunOrderDialog UI does not
 * render buttons for `'combined-asc' | 'combined-desc' | 'random-all'`,
 * so accepting them at the type boundary would create dead union
 * members whose runtime would fall to the armband-asc default branch
 * below — silently wrong for `'random-all'` in particular.
 *
 * `Extract` pins the local union as a structural subset of the
 * canonical union: if any of these member names is later removed from
 * `@myk9/ringside`, this type narrows further and every call site
 * narrowing on it breaks at compile time — the desired regression
 * alarm. To widen myK9Show's surface, add the new member here AND
 * extend the switch in `calculateRunOrder` to handle it explicitly.
 */
export type RunOrderPreset = Extract<
  RingsideRunOrderPreset,
  | 'armband-asc'
  | 'armband-desc'
  | 'random'
  | 'manual'
  | 'random-sections'
  | 'a-then-b-asc'
  | 'a-then-b-desc'
  | 'b-then-a-asc'
  | 'b-then-a-desc'
>;

export interface RunOrderEntry {
  id: string;
  armband: string | null;
  section?: string | null;
}

export interface RunOrderResult {
  id: string;
  runOrder: number;
}

/**
 * Translate a (wider) ringside `RunOrderPreset` to myK9Show's supported preset.
 *
 * ringside's union carries members myK9Show's RunOrderDialog doesn't model
 * (`combined-asc | combined-desc | random-all`). The at-show "Randomize All"
 * button emits ringside's `random-all`, which is semantically myK9Show's
 * `random`. Casting the wide type onto the narrow one (the previous approach)
 * let `random-all` fall through `calculateRunOrder`'s default branch to
 * deterministic armband-ascending — silently wrong. This makes the boundary
 * explicit: `random-all` → `random`; any other unsupported member (never
 * emitted by the dialog) falls back to `armband-asc`.
 */
export function toMyK9ShowRunOrderPreset(preset: RingsideRunOrderPreset): RunOrderPreset {
  switch (preset) {
    case 'armband-asc':
    case 'armband-desc':
    case 'random':
    case 'manual':
    case 'random-sections':
    case 'a-then-b-asc':
    case 'a-then-b-desc':
    case 'b-then-a-asc':
    case 'b-then-a-desc':
      return preset;
    case 'random-all':
      return 'random';
    default:
      return 'armband-asc';
  }
}

function parseArmband(armband: string | null): number {
  const n = parseInt(armband ?? '0', 10);
  return isNaN(n) ? 0 : n;
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Returns true if entries contain at least two distinct non-null sections.
 * Used to decide whether to show section-aware preset options in the UI.
 */
export function hasMultipleSections(entries: RunOrderEntry[]): boolean {
  const sections = new Set(entries.map(e => e.section).filter(s => s != null && s !== ''));
  return sections.size >= 2;
}

/**
 * Sort entries with first section first, second section second,
 * unsectioned entries last. Within each section, sort by armband in the
 * given direction.
 */
function calculateSectionOrder(
  entries: RunOrderEntry[],
  firstSection: string,
  secondSection: string,
  direction: 'asc' | 'desc'
): RunOrderEntry[] {
  const compareFn =
    direction === 'asc'
      ? (a: RunOrderEntry, b: RunOrderEntry) => parseArmband(a.armband) - parseArmband(b.armband)
      : (a: RunOrderEntry, b: RunOrderEntry) => parseArmband(b.armband) - parseArmband(a.armband);

  const first = entries.filter(e => e.section === firstSection).sort(compareFn);
  const second = entries.filter(e => e.section === secondSection).sort(compareFn);
  const others = entries
    .filter(e => e.section !== firstSection && e.section !== secondSection)
    .sort((a, b) => parseArmband(a.armband) - parseArmband(b.armband));

  return [...first, ...second, ...others];
}

/**
 * Shuffle entries within each section independently: A-section entries
 * are randomized among themselves, B-section entries among themselves,
 * then A entries come before B entries in the final run order.
 * Entries without a section are shuffled and appended last.
 */
function calculateRandomSections(entries: RunOrderEntry[]): RunOrderEntry[] {
  const aEntries = shuffleArray(entries.filter(e => e.section === 'A'));
  const bEntries = shuffleArray(entries.filter(e => e.section === 'B'));
  const others = shuffleArray(entries.filter(e => e.section !== 'A' && e.section !== 'B'));
  return [...aEntries, ...bEntries, ...others];
}

export function calculateRunOrder(
  entries: RunOrderEntry[],
  preset: RunOrderPreset
): RunOrderResult[] {
  if (preset === 'manual') return [];

  let sorted: RunOrderEntry[];

  switch (preset) {
    case 'armband-asc':
      sorted = [...entries].sort((a, b) => parseArmband(a.armband) - parseArmband(b.armband));
      break;

    case 'armband-desc':
      sorted = [...entries].sort((a, b) => parseArmband(b.armband) - parseArmband(a.armband));
      break;

    case 'random':
      sorted = shuffleArray([...entries]);
      break;

    case 'random-sections':
      sorted = calculateRandomSections(entries);
      break;

    case 'a-then-b-asc':
      sorted = calculateSectionOrder(entries, 'A', 'B', 'asc');
      break;

    case 'a-then-b-desc':
      sorted = calculateSectionOrder(entries, 'A', 'B', 'desc');
      break;

    case 'b-then-a-asc':
      sorted = calculateSectionOrder(entries, 'B', 'A', 'asc');
      break;

    case 'b-then-a-desc':
      sorted = calculateSectionOrder(entries, 'B', 'A', 'desc');
      break;

    default:
      sorted = [...entries].sort((a, b) => parseArmband(a.armband) - parseArmband(b.armband));
  }

  return sorted.map((entry, index) => ({ id: entry.id, runOrder: index + 1 }));
}

/**
 * Apply a run order preset scoped to a single section.
 * Only entries belonging to the given section are reordered; all other
 * entries keep their original positions (returned unchanged).
 *
 * Returns RunOrderResult[] for ALL entries, not just the scoped section,
 * so the caller can write all of them atomically.
 *
 * @param entries     Full list of entries for the class.
 * @param preset      Which preset to apply (armband-asc, armband-desc, random).
 * @param section     Which section to reorder ('A' or 'B').
 * @param renumberMode
 *   'preserve'  — scoped entries get new run-order values that continue after
 *                 the other section's max value (other section unchanged).
 *   'renumber'  — scoped section starts at 1; other section follows in sequence.
 */
export function calculateRunOrderScoped(
  entries: RunOrderEntry[],
  preset: RunOrderPreset,
  section: string,
  renumberMode: 'preserve' | 'renumber'
): RunOrderResult[] {
  const scopedEntries = entries.filter(e => e.section === section);
  const otherEntries = entries.filter(e => e.section !== section);

  // Reorder only the scoped section
  const reorderedScoped = calculateRunOrder(scopedEntries, preset);

  if (renumberMode === 'preserve') {
    // Find the max existing run_order among other entries
    // We don't have run_order on RunOrderEntry, so we just place scoped after
    // the other count (caller controls DB writes).
    const offset = otherEntries.length;
    const adjustedScoped = reorderedScoped.map(r => ({
      id: r.id,
      runOrder: r.runOrder + offset,
    }));
    const otherResults = otherEntries.map((e, i) => ({ id: e.id, runOrder: i + 1 }));
    return [...otherResults, ...adjustedScoped];
  } else {
    // renumber: scoped section first (1, 2, 3...), other follows
    const adjustedOther = otherEntries.map((e, i) => ({
      id: e.id,
      runOrder: reorderedScoped.length + i + 1,
    }));
    return [...reorderedScoped, ...adjustedOther];
  }
}

// `RunOrderScope` ('all' | 'A' | 'B') is single-sourced from `@myk9/ringside`
// (re-exported here for the calculators' callers) — same DRY discipline as
// `RunOrderPreset` above, so a future ringside scope can't drift silently.
export type { RunOrderScope };

/**
 * Combined (Section A/B) run-order dispatcher — the section-aware sibling of
 * `calculateRunOrder` used by the single-class list.
 *
 * Routes by `scope`:
 *  - `'all'`  → reorder the whole class with `calculateRunOrder` (the preset
 *               itself decides section grouping, e.g. `a-then-b-asc`).
 *  - `'A'|'B'`→ reorder ONLY that section via `calculateRunOrderScoped`,
 *               with `renumberMode` deciding what happens to the other
 *               section's numbers (`'renumber'` re-sequences 1..N, `'preserve'`
 *               keeps the other section ahead untouched).
 *
 * `renumberMode` is ignored for `'all'` (every entry is renumbered anyway).
 * Returns a `RunOrderResult` for EVERY entry so the caller can persist the
 * whole class atomically. `'manual'` yields `[]` (drag mode handles it).
 */
export function calculateCombinedRunOrder(
  entries: RunOrderEntry[],
  preset: RunOrderPreset,
  scope: RunOrderScope = 'all',
  renumberMode: 'preserve' | 'renumber' = 'renumber'
): RunOrderResult[] {
  if (preset === 'manual') return [];
  if (scope === 'A' || scope === 'B') {
    return calculateRunOrderScoped(entries, preset, scope, renumberMode);
  }
  return calculateRunOrder(entries, preset);
}
