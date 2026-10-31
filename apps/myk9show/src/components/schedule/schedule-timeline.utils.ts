import { CLASS_STATUS, formatClockTime, normalizeClassStatus, parseStoredClockTime } from '@myk9/core';
import type { ClassStatusValue } from '@myk9/core';
import { compareClassSchedule } from '@/features/_shared/classScheduleOrder';
import { compareLevels } from '@/utils/schedule-summary';
import type {
  DayTimelineData,
  ElementSummary,
  JudgeTimelineData,
  LevelDetail,
  TimelineClassRow,
  TrialTimelineClassRow,
  TrialTimelineData,
} from './schedule-timeline.types';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Format a time value for display. Handles display text ("9:00 AM"), ISO timestamps, and time-only ("09:00:00"). */
export function formatStartTime(time: string | null): string | null {
  if (!time) return null;

  // Full ISO timestamp (e.g., "2026-04-04T09:00:00+00:00")
  if (time.includes('T') || time.includes('-')) {
    const d = new Date(time);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  // Clock text, 12- or 24-hour (e.g., "9:00 AM", "09:00:00")
  const minutes = parseStoredClockTime(time);
  return minutes === null ? null : formatClockTime(minutes);
}

/** Minutes after midnight; null (untimed or unreadable) sorts after every timed value. */
function compareStartTimes(a: string | null, b: string | null): number {
  return compareClassSchedule({ time: a }, { time: b });
}

/** Compare elements by clock time (replica text is "9:00 AM", not sortable as a string), untimed last. */
function compareByStartTime(a: { startTime: string | null }, b: { startTime: string | null }) {
  return compareStartTimes(a.startTime, b.startTime);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEVEL_ABBREVIATIONS: Record<string, string> = {
  Novice: 'Novice',
  Advanced: 'Adv',
  Open: 'Open',
  Excellent: 'Exc',
  Utility: 'Util',
  Master: 'Master',
};

// ---------------------------------------------------------------------------
// deriveElementStatus
// ---------------------------------------------------------------------------

/** Returns true when the status means "not yet started" (Scheduled OR Upcoming). */
function isScheduledOrUpcoming(status: ClassStatusValue): boolean {
  return status === CLASS_STATUS.SCHEDULED || status === CLASS_STATUS.UPCOMING;
}

/**
 * Derives an aggregate status from child level statuses.
 *
 * Logic: filter out cancelled → all completed → all scheduled/upcoming → else in progress.
 * If every level is cancelled, returns Cancelled. Empty array returns Scheduled.
 */
export function deriveElementStatus(levels: LevelDetail[]): ClassStatusValue {
  if (levels.length === 0) return CLASS_STATUS.SCHEDULED;

  const active = levels.filter(l => l.status !== CLASS_STATUS.CANCELLED);

  if (active.length === 0) return CLASS_STATUS.CANCELLED;

  if (active.every(l => l.status === CLASS_STATUS.COMPLETED)) {
    return CLASS_STATUS.COMPLETED;
  }

  if (active.every(l => isScheduledOrUpcoming(l.status))) {
    return CLASS_STATUS.SCHEDULED;
  }

  return CLASS_STATUS.IN_PROGRESS;
}

// ---------------------------------------------------------------------------
// formatLevelRange
// ---------------------------------------------------------------------------

/**
 * Abbreviates and formats a level range string.
 *
 * Examples: ["Novice","Advanced","Open"] → "Nov–Open"
 *           ["Novice"] → "Nov"
 *           [] → ""
 */
export function formatLevelRange(levels: string[]): string {
  if (levels.length === 0) return '';

  const sorted = [...levels].sort(compareLevels);
  const abbreviated = sorted.map(l => LEVEL_ABBREVIATIONS[l] ?? l);

  if (abbreviated.length === 1) return abbreviated[0]!;

  return `${abbreviated[0]}–${abbreviated[abbreviated.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Private helper
// ---------------------------------------------------------------------------

interface ClassRowLike {
  classId: string;
  className: string;
  level: string | null;
  status: string;
  totalEntriesCount: number;
  startTime: string | null;
  judgePersonId: string | null;
  judgeFirstName: string | null;
  judgeLastName: string | null;
}

function getJudgeName(row: ClassRowLike): string | null {
  const name = [row.judgeFirstName, row.judgeLastName].filter(Boolean).join(' ').trim();
  return name || null;
}

function buildElementSummary(elementName: string, classes: ClassRowLike[]): ElementSummary {
  // Build level details with normalized statuses
  const levelDetails: LevelDetail[] = classes.map(c => ({
    classId: c.classId,
    className: c.className,
    level: c.level ?? elementName,
    status: normalizeClassStatus(c.status),
    entryCount: c.totalEntriesCount,
    startTime: c.startTime,
    judgeId: c.judgePersonId,
    judgeName: getJudgeName(c),
  }));

  // Sort by progression order
  levelDetails.sort((a, b) => compareLevels(a.level, b.level));

  // Unique level names (preserving sorted order)
  const uniqueLevels: string[] = [];
  const seen = new Set<string>();
  for (const ld of levelDetails) {
    if (!seen.has(ld.level)) {
      seen.add(ld.level);
      uniqueLevels.push(ld.level);
    }
  }

  // Earliest start time (O(n) reduce instead of sort)
  const earliestStartTime = classes.reduce<string | null>(
    (min, c) => (compareStartTimes(c.startTime, min) < 0 ? c.startTime : min),
    null
  );

  // Pre-compute counts so components don't filter on every render
  const completedCount = levelDetails.filter(l => l.status === CLASS_STATUS.COMPLETED).length;
  const totalCount = levelDetails.filter(l => l.status !== CLASS_STATUS.CANCELLED).length;

  return {
    element: elementName,
    startTime: earliestStartTime,
    levelRange: formatLevelRange(uniqueLevels),
    status: deriveElementStatus(levelDetails),
    levels: levelDetails,
    completedCount,
    totalCount,
  };
}

// ---------------------------------------------------------------------------
// groupByDay
// ---------------------------------------------------------------------------

/**
 * Groups timeline class rows by date → trial → element.
 */
export function groupByDay(rows: TimelineClassRow[]): DayTimelineData[] {
  if (rows.length === 0) return [];

  // date → trialId → elementName → classes
  const byDate = new Map<string, Map<string, Map<string, TimelineClassRow[]>>>();

  for (const row of rows) {
    const dateKey = row.trialDate;
    if (!byDate.has(dateKey)) byDate.set(dateKey, new Map());
    const dateGroup = byDate.get(dateKey)!;

    const trialKey = row.trialId;
    if (!dateGroup.has(trialKey)) dateGroup.set(trialKey, new Map());
    const trialGroup = dateGroup.get(trialKey)!;

    const elementKey = row.element ?? row.className;
    if (!trialGroup.has(elementKey)) trialGroup.set(elementKey, []);
    trialGroup.get(elementKey)!.push(row);
  }

  // Sort dates
  const sortedDates = [...byDate.keys()].sort();

  return sortedDates.map(date => {
    const trialMap = byDate.get(date)!;

    // Build trials, sort by trialNumber
    const trials: TrialTimelineData[] = [...trialMap.entries()]
      .map(([trialId, elementMap]) => {
        // Get trial metadata from the first row of any element
        const firstRow = elementMap.values().next().value![0]!;

        const elements: ElementSummary[] = [...elementMap.entries()].map(([elementName, classes]) =>
          buildElementSummary(elementName, classes)
        );

        elements.sort(compareByStartTime);

        return {
          trialId,
          trialName: firstRow.trialName,
          trialNumber: firstRow.trialNumber,
          plannedStartTime: firstRow.trialPlannedStartTime,
          elements,
        };
      })
      .sort((a, b) => {
        const aNum = a.trialNumber ?? '';
        const bNum = b.trialNumber ?? '';
        return aNum.localeCompare(bNum);
      });

    return { date, trials };
  });
}

// ---------------------------------------------------------------------------
// groupByJudge
// ---------------------------------------------------------------------------

/**
 * Groups trial class rows by judge → element.
 */
export function groupByJudge(rows: TrialTimelineClassRow[]): JudgeTimelineData[] {
  if (rows.length === 0) return [];

  const UNASSIGNED_KEY = '__unassigned__';

  // judgeKey → elementName → classes
  const byJudge = new Map<string, Map<string, TrialTimelineClassRow[]>>();
  // judgeKey → judge metadata
  const judgeMeta = new Map<string, { judgeId: string | null; judgeName: string }>();

  for (const row of rows) {
    const judgeKey = row.judgePersonId ?? UNASSIGNED_KEY;

    if (!byJudge.has(judgeKey)) {
      byJudge.set(judgeKey, new Map());
      const name =
        row.judgeFirstName && row.judgeLastName
          ? `${row.judgeFirstName} ${row.judgeLastName}`
          : 'Unassigned';
      judgeMeta.set(judgeKey, {
        judgeId: row.judgePersonId,
        judgeName: name,
      });
    }

    const elementMap = byJudge.get(judgeKey)!;
    const elementKey = row.element ?? row.className;
    if (!elementMap.has(elementKey)) elementMap.set(elementKey, []);
    elementMap.get(elementKey)!.push(row);
  }

  // Sort judges: assigned first (alphabetical by name), unassigned last
  const sortedKeys = [...byJudge.keys()].sort((a, b) => {
    if (a === UNASSIGNED_KEY) return 1;
    if (b === UNASSIGNED_KEY) return -1;
    const nameA = judgeMeta.get(a)!.judgeName;
    const nameB = judgeMeta.get(b)!.judgeName;
    return nameA.localeCompare(nameB);
  });

  return sortedKeys.map(judgeKey => {
    const meta = judgeMeta.get(judgeKey)!;
    const elementMap = byJudge.get(judgeKey)!;

    const elements: ElementSummary[] = [...elementMap.entries()].map(([elementName, classes]) =>
      buildElementSummary(elementName, classes)
    );

    elements.sort(compareByStartTime);

    return {
      judgeId: meta.judgeId,
      judgeName: meta.judgeName,
      ringNumber: null,
      elements,
    };
  });
}
