import type { SecretaryTask } from './types';

export type UrgencyBucket = 'overdue' | 'today' | 'this-week' | 'future';

export interface DatedTask {
  task: SecretaryTask;
  dueDate: Date;
  urgency: UrgencyBucket;
}

export interface TimelineGroup {
  showId: string | null;
  showName: string;
  datedTasks: DatedTask[];
  undatedTasks: SecretaryTask[];
}

/**
 * Parse a date-only string (YYYY-MM-DD) without timezone shift.
 * new Date('2024-03-15') is treated as UTC midnight, which can shift
 * to the previous day in negative-UTC-offset timezones.
 * We parse year/month/day explicitly and use local Date constructor.
 */
export function parseDateOnly(dateStr: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (isNaN(date.getTime())) return null;
  return date;
}

/** Strip time from a Date so comparisons are date-only. */
export function toDateOnly(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getUrgency(dueDate: Date, today: Date): UrgencyBucket {
  const due = toDateOnly(dueDate);
  const t = toDateOnly(today);
  const sevenDays = new Date(t.getTime() + 7 * 86400000);

  if (due < t) return 'overdue';
  if (due.getTime() === t.getTime()) return 'today';
  if (due <= sevenDays) return 'this-week';
  return 'future';
}

/** Split tasks into dated and undated sets. */
export function splitDatedUndated(tasks: SecretaryTask[]): {
  dated: DatedTask[];
  undated: SecretaryTask[];
} {
  const today = toDateOnly(new Date());
  const dated: DatedTask[] = [];
  const undated: SecretaryTask[] = [];

  for (const task of tasks) {
    if (!task.dueDate) {
      undated.push(task);
      continue;
    }
    const parsed = parseDateOnly(task.dueDate);
    if (!parsed) {
      undated.push(task);
      continue;
    }
    dated.push({ task, dueDate: parsed, urgency: getUrgency(parsed, today) });
  }

  return { dated, undated };
}

/**
 * Calculate the visible date range for the timeline.
 * Range: today through the latest due date, capped at MAX_DAYS.
 * If all tasks are overdue, include from earliest due date through today.
 */
const MAX_DAYS = 45;

export interface DateRange {
  start: Date;
  end: Date;
  /** Array of Date objects for each day in the range. */
  days: Date[];
}

export function calcDateRange(datedTasks: DatedTask[]): DateRange {
  const today = toDateOnly(new Date());

  if (datedTasks.length === 0) {
    const end = new Date(today.getTime() + 14 * 86400000);
    return buildRange(today, end);
  }

  const dueDates = datedTasks.map(d => d.dueDate.getTime());
  const minDue = new Date(Math.min(...dueDates));
  const maxDue = new Date(Math.max(...dueDates));

  const start = minDue < today ? toDateOnly(minDue) : today;
  const rawEnd = maxDue > today ? toDateOnly(maxDue) : today;
  const cappedEnd = new Date(Math.min(rawEnd.getTime(), today.getTime() + MAX_DAYS * 86400000));

  return buildRange(start, cappedEnd);
}

function buildRange(start: Date, end: Date): DateRange {
  const days: Date[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return { start, end, days };
}

/**
 * Group tasks by show.
 * When showIdFilter is 'all', tasks are grouped by their showId.
 * Otherwise all tasks fall into a single group.
 */
export function groupByShow(
  tasks: SecretaryTask[],
  showNameMap: Record<string, string>,
  showIdFilter: string
): TimelineGroup[] {
  if (showIdFilter !== 'all') {
    const { dated, undated } = splitDatedUndated(tasks);
    const showName =
      showIdFilter === 'general' ? 'General' : (showNameMap[showIdFilter] ?? showIdFilter);
    return [
      {
        showId: showIdFilter === 'general' ? null : showIdFilter,
        showName,
        datedTasks: sortDated(dated),
        undatedTasks: undated,
      },
    ];
  }

  // Group by showId
  const groups = new Map<string | null, SecretaryTask[]>();
  for (const task of tasks) {
    const key = task.showId ?? null;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(task);
  }

  const result: TimelineGroup[] = [];
  for (const [showId, groupTasks] of groups) {
    const { dated, undated } = splitDatedUndated(groupTasks);
    const showName = showId ? (showNameMap[showId] ?? showId) : 'General';
    result.push({
      showId,
      showName,
      datedTasks: sortDated(dated),
      undatedTasks: undated,
    });
  }

  // General tasks last
  result.sort((a, b) => {
    if (a.showId === null) return 1;
    if (b.showId === null) return -1;
    return a.showName.localeCompare(b.showName);
  });

  return result;
}

function sortDated(tasks: DatedTask[]): DatedTask[] {
  return [...tasks].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

/** Summary counts across all visible tasks. */
export interface TimelineSummary {
  overdue: number;
  dueThisWeek: number;
  unscheduled: number;
}

export function calcSummary(tasks: SecretaryTask[]): TimelineSummary {
  const { dated, undated } = splitDatedUndated(tasks);
  let overdue = 0;
  let dueThisWeek = 0;
  for (const { urgency } of dated) {
    if (urgency === 'overdue') overdue++;
    if (urgency === 'today' || urgency === 'this-week') dueThisWeek++;
  }
  return { overdue, dueThisWeek, unscheduled: undated.length };
}
