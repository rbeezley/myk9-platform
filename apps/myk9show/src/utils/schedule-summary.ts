/**
 * Raw row from the schedule query (trials JOIN classes).
 */
export interface ScheduleClassRow {
  trialDate: string;
  discipline: string | null;
  element: string | null;
  level: string | null;
  name: string;
}

/**
 * A single discipline's summary for one day.
 */
export interface DisciplineSummary {
  name: string;
  elements: string[]; // distinct, sorted (empty if none)
  levels: string[]; // distinct, sorted
  classNames: string[]; // only populated for "Other" group
}

/**
 * One day's schedule.
 */
export interface DaySummary {
  date: string;
  disciplines: DisciplineSummary[];
}

/**
 * Progression order for levels — matches the order shown in show premiums.
 * Levels not in this list sort alphabetically after all known levels.
 */
const LEVEL_ORDER: Record<string, number> = {
  Novice: 0,
  Advanced: 1,
  Open: 2,
  Excellent: 3,
  Utility: 4,
  Master: 5,
};

function compareLevels(a: string, b: string): number {
  const aOrder = LEVEL_ORDER[a] ?? 100;
  const bOrder = LEVEL_ORDER[b] ?? 100;
  if (aOrder !== bOrder) return aOrder - bOrder;
  return a.localeCompare(b);
}

/**
 * Groups trial/class rows into a day-by-day schedule summary.
 *
 * Groups by date → discipline, collecting distinct elements and levels.
 * Classes with null discipline go into an "Other" group showing class names verbatim.
 */
export function summarizeSchedule(rows: ScheduleClassRow[]): DaySummary[] {
  if (rows.length === 0) return [];

  // Group by date, then by discipline
  const byDate = new Map<
    string,
    Map<string, { elements: Set<string>; levels: Set<string>; classNames: Set<string> }>
  >();

  for (const row of rows) {
    const dateKey = row.trialDate;
    const disciplineKey = row.discipline ?? 'Other';

    if (!byDate.has(dateKey)) {
      byDate.set(dateKey, new Map());
    }
    const dateGroup = byDate.get(dateKey)!;

    if (!dateGroup.has(disciplineKey)) {
      dateGroup.set(disciplineKey, {
        elements: new Set(),
        levels: new Set(),
        classNames: new Set(),
      });
    }
    const disc = dateGroup.get(disciplineKey)!;

    if (row.element) disc.elements.add(row.element);
    if (row.level) disc.levels.add(row.level);
    disc.classNames.add(row.name);
  }

  // Convert to sorted output
  const dates = [...byDate.keys()].sort();

  return dates.map(date => {
    const disciplineMap = byDate.get(date)!;
    const disciplineNames = [...disciplineMap.keys()].sort();

    const disciplines: DisciplineSummary[] = disciplineNames.map(name => {
      const data = disciplineMap.get(name)!;
      return {
        name,
        elements: [...data.elements].sort(),
        levels: [...data.levels].sort(compareLevels),
        classNames: name === 'Other' ? [...data.classNames].sort() : [],
      };
    });

    return { date, disciplines };
  });
}
