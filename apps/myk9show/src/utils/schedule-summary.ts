/**
 * Raw row from the schedule query (trials JOIN classes).
 */
export interface ScheduleClassRow {
  trialDate: string;
  trialNumber: string | null;
  discipline: string | null;
  element: string | null;
  level: string | null;
  name: string;
}

/**
 * A single discipline's summary for one trial.
 */
export interface DisciplineSummary {
  name: string;
  elements: string[]; // distinct, sorted (empty if none)
  levels: string[]; // distinct, sorted
  classNames: string[]; // only populated for "Other" group
}

/**
 * One trial's schedule within a day.
 */
export interface TrialSummary {
  trialNumber: string | null;
  disciplines: DisciplineSummary[];
}

/**
 * One day's schedule (may contain multiple trials).
 */
export interface DaySummary {
  date: string;
  trials: TrialSummary[];
  /** @deprecated Use trials instead */
  disciplines: DisciplineSummary[];
}

/**
 * Progression order for levels — matches the order shown in show premiums.
 * Levels not in this list sort alphabetically after all known levels.
 */
export const LEVEL_ORDER: Record<string, number> = {
  Novice: 0,
  Advanced: 1,
  Open: 2,
  Excellent: 3,
  Utility: 4,
  Master: 5,
};

// 'Masters' (plural) is a legacy AKC alias for 'Master' — the DB and current
// templates use 'Master', but some legacy data still emits 'Masters'.
const LEVEL_ALIASES: Record<string, string> = {
  Masters: 'Master',
};

const LEVEL_ORDER_BY_LOWER: Record<string, number> = Object.fromEntries(
  Object.entries(LEVEL_ORDER).map(([level, order]) => [level.toLowerCase(), order])
);
const LEVEL_ALIASES_BY_LOWER: Record<string, string> = Object.fromEntries(
  Object.entries(LEVEL_ALIASES).map(([alias, canonical]) => [
    alias.toLowerCase(),
    canonical.toLowerCase(),
  ])
);

// Levels come from free-text DB columns and callers pass them through
// unmodified, so casing and whitespace vary ('novice', ' Advanced ',
// 'NOVICE') — normalize before the progression lookup so every caller gets
// the same order regardless of how the source data was cased.
function levelOrder(level: string): number {
  const key = level.trim().toLowerCase();
  const canonicalKey = LEVEL_ALIASES_BY_LOWER[key] ?? key;
  return LEVEL_ORDER_BY_LOWER[canonicalKey] ?? 100;
}

export function compareLevels(a: string, b: string): number {
  const aOrder = levelOrder(a);
  const bOrder = levelOrder(b);
  if (aOrder !== bOrder) return aOrder - bOrder;
  return a.localeCompare(b);
}

/**
 * Build a DisciplineSummary array from a set of class rows.
 */
function buildDisciplines(rows: ScheduleClassRow[]): DisciplineSummary[] {
  const disciplineMap = new Map<
    string,
    { elements: Set<string>; levels: Set<string>; classNames: Set<string> }
  >();

  for (const row of rows) {
    const disciplineKey = row.discipline ?? 'Other';
    if (!disciplineMap.has(disciplineKey)) {
      disciplineMap.set(disciplineKey, {
        elements: new Set(),
        levels: new Set(),
        classNames: new Set(),
      });
    }
    const disc = disciplineMap.get(disciplineKey)!;
    if (row.element) disc.elements.add(row.element);
    if (row.level) disc.levels.add(row.level);
    disc.classNames.add(row.name);
  }

  return [...disciplineMap.keys()].sort().map(name => {
    const data = disciplineMap.get(name)!;
    return {
      name,
      elements: [...data.elements].sort(),
      levels: [...data.levels].sort(compareLevels),
      classNames: name === 'Other' ? [...data.classNames].sort() : [],
    };
  });
}

/**
 * Groups trial/class rows into a day-by-day schedule summary.
 *
 * Groups by date → trial → discipline, collecting distinct elements and levels.
 * Classes with null discipline go into an "Other" group showing class names verbatim.
 */
export function summarizeSchedule(rows: ScheduleClassRow[]): DaySummary[] {
  if (rows.length === 0) return [];

  // Group by date, then by trial number
  const byDate = new Map<string, Map<string, ScheduleClassRow[]>>();

  for (const row of rows) {
    const dateKey = row.trialDate;
    const trialKey = row.trialNumber ?? '_default';

    if (!byDate.has(dateKey)) {
      byDate.set(dateKey, new Map());
    }
    const dateGroup = byDate.get(dateKey)!;

    if (!dateGroup.has(trialKey)) {
      dateGroup.set(trialKey, []);
    }
    dateGroup.get(trialKey)!.push(row);
  }

  const dates = [...byDate.keys()].sort();

  return dates.map(date => {
    const trialMap = byDate.get(date)!;
    const trialKeys = [...trialMap.keys()].sort();

    const trials: TrialSummary[] = trialKeys.map(key => ({
      trialNumber: key === '_default' ? null : key,
      disciplines: buildDisciplines(trialMap.get(key)!),
    }));

    // Flatten all disciplines for backwards compat
    const allRows: ScheduleClassRow[] = [];
    for (const trialRows of trialMap.values()) {
      allRows.push(...trialRows);
    }

    return {
      date,
      trials,
      disciplines: buildDisciplines(allRows),
    };
  });
}
