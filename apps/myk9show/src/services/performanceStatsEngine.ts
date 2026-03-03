/**
 * Performance Statistics Engine — pure computation, no side effects.
 *
 * Normalizes platform-scored results + manual results into a common shape,
 * then computes summary statistics, breakdowns, and timelines.
 */
import type { ExhibitorResult } from '@/hooks/queries/useExhibitorResults';
import type { ManualResult, ManualResultStatus } from '@/types/manual-result-types';

// ========================================
// TYPES
// ========================================

/** Unified result shape for stats computation */
export interface NormalizedResult {
  id: string;
  source: 'platform' | 'manual';
  date: string;
  showName: string;
  element: string | null;
  level: string | null;
  judge: string | null;
  status: 'qualified' | 'nq' | 'absent' | 'excused' | 'withdrawn';
  searchTimeSeconds: number | null;
  className: string | null;
}

export interface StatusBreakdown {
  qualified: number;
  nq: number;
  absent: number;
  excused: number;
  withdrawn: number;
  total: number;
  qRate: number;
}

export interface ElementStats {
  element: string;
  breakdown: StatusBreakdown;
  avgSearchTime: number | null;
}

export interface LevelStats {
  level: string;
  breakdown: StatusBreakdown;
}

export interface JudgeStats {
  judge: string;
  breakdown: StatusBreakdown;
}

export interface TimelinePoint {
  date: string;
  cumulativeQLegs: number;
}

export interface PerformanceSummary {
  totalCompetitions: number;
  fastestTime: { seconds: number; className: string | null } | null;
  avgTime: number | null;
  firstDate: string | null;
  latestDate: string | null;
}

export interface PerformanceStats {
  overall: StatusBreakdown;
  byElement: ElementStats[];
  byLevel: LevelStats[];
  byJudge: JudgeStats[];
  timeline: TimelinePoint[];
  summary: PerformanceSummary;
}

// ========================================
// NORMALIZATION
// ========================================

const VALID_STATUSES = ['qualified', 'nq', 'absent', 'excused', 'withdrawn'] as const;

function normalizeStatus(status: string): NormalizedResult['status'] {
  if ((VALID_STATUSES as readonly string[]).includes(status)) {
    return status as NormalizedResult['status'];
  }
  return 'nq';
}

export function normalizeExhibitorResult(r: ExhibitorResult): NormalizedResult {
  return {
    id: r.id,
    source: 'platform',
    date: r.showDate,
    showName: r.showName,
    element: r.classElement,
    level: r.classLevel,
    judge: null,
    status: normalizeStatus(r.resultStatus),
    searchTimeSeconds: r.searchTimeSeconds,
    className: r.className,
  };
}

export function normalizeManualResult(r: ManualResult): NormalizedResult {
  return {
    id: r.id,
    source: 'manual',
    date: r.trial_date,
    showName: r.show_name,
    element: r.element,
    level: r.level,
    judge: r.judge,
    status: normalizeStatus(r.result_status),
    searchTimeSeconds: r.search_time_seconds,
    className: null,
  };
}

// ========================================
// COMPUTATION
// ========================================

function computeBreakdown(results: NormalizedResult[]): StatusBreakdown {
  const counts: Record<ManualResultStatus, number> = {
    qualified: 0,
    nq: 0,
    absent: 0,
    excused: 0,
    withdrawn: 0,
  };
  for (const r of results) {
    counts[r.status]++;
  }
  const total = results.length;
  return {
    ...counts,
    total,
    qRate: total > 0 ? Math.round((counts.qualified / total) * 100) : 0,
  };
}

function computeAvgTime(results: NormalizedResult[]): number | null {
  const times = results
    .filter(r => r.status === 'qualified' && r.searchTimeSeconds != null)
    .map(r => r.searchTimeSeconds!);
  if (times.length === 0) return null;
  return times.reduce((sum, t) => sum + t, 0) / times.length;
}

export function computePerformanceStats(
  platformResults: ExhibitorResult[],
  manualResults: ManualResult[]
): PerformanceStats {
  const normalized = [
    ...platformResults.map(normalizeExhibitorResult),
    ...manualResults.map(normalizeManualResult),
  ];

  if (normalized.length === 0) {
    return {
      overall: { qualified: 0, nq: 0, absent: 0, excused: 0, withdrawn: 0, total: 0, qRate: 0 },
      byElement: [],
      byLevel: [],
      byJudge: [],
      timeline: [],
      summary: {
        totalCompetitions: 0,
        fastestTime: null,
        avgTime: null,
        firstDate: null,
        latestDate: null,
      },
    };
  }

  // Overall
  const overall = computeBreakdown(normalized);

  // By element
  const elementMap = new Map<string, NormalizedResult[]>();
  for (const r of normalized) {
    if (!r.element) continue;
    const arr = elementMap.get(r.element) || [];
    arr.push(r);
    elementMap.set(r.element, arr);
  }
  const byElement: ElementStats[] = Array.from(elementMap.entries())
    .map(([element, results]) => ({
      element,
      breakdown: computeBreakdown(results),
      avgSearchTime: computeAvgTime(results),
    }))
    .sort((a, b) => b.breakdown.total - a.breakdown.total);

  // By level
  const levelMap = new Map<string, NormalizedResult[]>();
  for (const r of normalized) {
    if (!r.level) continue;
    const arr = levelMap.get(r.level) || [];
    arr.push(r);
    levelMap.set(r.level, arr);
  }
  const byLevel: LevelStats[] = Array.from(levelMap.entries())
    .map(([level, results]) => ({
      level,
      breakdown: computeBreakdown(results),
    }))
    .sort((a, b) => b.breakdown.total - a.breakdown.total);

  // By judge (only results with judge info)
  const judgeMap = new Map<string, NormalizedResult[]>();
  for (const r of normalized) {
    if (!r.judge) continue;
    const arr = judgeMap.get(r.judge) || [];
    arr.push(r);
    judgeMap.set(r.judge, arr);
  }
  const byJudge: JudgeStats[] = Array.from(judgeMap.entries())
    .map(([judge, results]) => ({
      judge,
      breakdown: computeBreakdown(results),
    }))
    .sort((a, b) => b.breakdown.total - a.breakdown.total);

  // Timeline: cumulative qualifying legs over time
  const sorted = [...normalized].sort((a, b) => a.date.localeCompare(b.date));
  let cumQ = 0;
  const timeline: TimelinePoint[] = [];
  for (const r of sorted) {
    if (r.status === 'qualified') cumQ++;
    timeline.push({ date: r.date, cumulativeQLegs: cumQ });
  }

  // Summary
  const qResults = normalized.filter(r => r.status === 'qualified' && r.searchTimeSeconds != null);
  let fastestTime: PerformanceSummary['fastestTime'] = null;
  if (qResults.length > 0) {
    const fastest = qResults.reduce((min, r) =>
      r.searchTimeSeconds! < min.searchTimeSeconds! ? r : min
    );
    fastestTime = { seconds: fastest.searchTimeSeconds!, className: fastest.className };
  }

  const avgTime = computeAvgTime(normalized);

  const dates = normalized
    .map(r => r.date)
    .filter(Boolean)
    .sort();

  const summary: PerformanceSummary = {
    totalCompetitions: normalized.length,
    fastestTime,
    avgTime,
    firstDate: dates[0] || null,
    latestDate: dates[dates.length - 1] || null,
  };

  return { overall, byElement, byLevel, byJudge, timeline, summary };
}
