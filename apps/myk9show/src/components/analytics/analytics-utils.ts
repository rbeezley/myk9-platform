export interface StatsEntry {
  id: string;
  dogId: string;
  dogCallName: string;
  showId: string;
  showName: string;
  showDate: string;
  classId: string;
  className: string;
  classElement: string | null;
  classLevel: string | null;
  resultText: 'Q' | 'NQ' | 'ABS' | 'EX' | 'WD' | 'pending';
  searchTimeSeconds: number | null;
  totalFaults: number | null;
  finalPlacement: number | null;
  organization?: string | undefined;
}

export interface SummaryStats {
  totalEntries: number;
  scoredEntries: number;
  qualifiedCount: number;
  /** 0–1 fraction (multiply by 100 for display) */
  qualificationRate: number;
  bestTime: number | null;
  bestTimeDogName: string | null;
  avgTime: number | null;
  medianTime: number | null;
}

export interface DogStats {
  dogId: string;
  dogCallName: string;
  entries: number;
  qualifiedCount: number;
  /** 0–1 fraction */
  qualificationRate: number;
  bestTime: number | null;
  avgTime: number | null;
  isCleanSweep: boolean;
}

export interface ResultDistributionItem {
  status: 'Q' | 'NQ' | 'EX' | 'ABS' | 'WD';
  label: string;
  count: number;
  color: string;
}

export interface FastestTimeEntry {
  rank: number;
  id: string;
  dogCallName: string;
  className: string;
  classElement: string | null;
  classLevel: string | null;
  searchTimeSeconds: number;
  showName: string;
}

export interface TrendPoint {
  showId: string;
  showName: string;
  showDate: string;
  totalEntries: number;
  qualifiedCount: number;
  /** 0–1 fraction */
  qualificationRate: number;
}

export interface CleanSweepDog {
  dogId: string;
  dogCallName: string;
  totalEntries: number;
  qualifiedCount: number;
}

function isScored(entry: StatsEntry): boolean {
  return entry.resultText !== 'pending';
}

function isQualified(entry: StatsEntry): boolean {
  return entry.resultText === 'Q';
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

const EMPTY_SUMMARY: SummaryStats = {
  totalEntries: 0,
  scoredEntries: 0,
  qualifiedCount: 0,
  qualificationRate: 0,
  bestTime: null,
  bestTimeDogName: null,
  avgTime: null,
  medianTime: null,
};

export function computeSummaryStats(entries: StatsEntry[]): SummaryStats {
  if (entries.length === 0) return EMPTY_SUMMARY;

  // Single pass: count scored/qualified and collect qualified times
  let scoredCount = 0;
  let qualifiedCount = 0;
  const qualifiedTimes: number[] = [];
  let bestTimeDogName: string | null = null;

  for (const e of entries) {
    if (!isScored(e)) continue;
    scoredCount++;
    if (isQualified(e)) {
      qualifiedCount++;
      if (e.searchTimeSeconds != null) {
        qualifiedTimes.push(e.searchTimeSeconds);
      }
    }
  }

  qualifiedTimes.sort((a, b) => a - b);

  if (qualifiedTimes.length > 0) {
    const bestTime = qualifiedTimes[0]!;
    bestTimeDogName =
      entries.find(
        (e) => isQualified(e) && e.searchTimeSeconds === bestTime,
      )?.dogCallName ?? null;
  }

  return {
    totalEntries: entries.length,
    scoredEntries: scoredCount,
    qualifiedCount,
    qualificationRate: scoredCount > 0 ? qualifiedCount / scoredCount : 0,
    bestTime: qualifiedTimes.length > 0 ? qualifiedTimes[0]! : null,
    bestTimeDogName,
    avgTime:
      qualifiedTimes.length > 0
        ? qualifiedTimes.reduce((sum, t) => sum + t, 0) / qualifiedTimes.length
        : null,
    medianTime: qualifiedTimes.length > 0 ? median(qualifiedTimes) : null,
  };
}

export function computePerDogStats(entries: StatsEntry[]): DogStats[] {
  if (entries.length === 0) return [];

  const grouped = new Map<string, StatsEntry[]>();
  for (const entry of entries) {
    const list = grouped.get(entry.dogId) ?? [];
    list.push(entry);
    grouped.set(entry.dogId, list);
  }

  const results: DogStats[] = [];
  for (const [dogId, dogEntries] of grouped) {
    let scoredCount = 0;
    let qualifiedCount = 0;
    const times: number[] = [];

    for (const e of dogEntries) {
      if (!isScored(e)) continue;
      scoredCount++;
      if (isQualified(e)) {
        qualifiedCount++;
        if (e.searchTimeSeconds != null) times.push(e.searchTimeSeconds);
      }
    }

    times.sort((a, b) => a - b);

    results.push({
      dogId,
      dogCallName: dogEntries[0]!.dogCallName,
      entries: dogEntries.length,
      qualifiedCount,
      qualificationRate: scoredCount > 0 ? qualifiedCount / scoredCount : 0,
      bestTime: times.length > 0 ? times[0]! : null,
      avgTime:
        times.length > 0
          ? times.reduce((sum, t) => sum + t, 0) / times.length
          : null,
      isCleanSweep: scoredCount > 0 && qualifiedCount === scoredCount,
    });
  }

  return results;
}

const RESULT_CONFIG: {
  status: 'Q' | 'NQ' | 'EX' | 'ABS' | 'WD';
  label: string;
  color: string;
}[] = [
  { status: 'Q', label: 'Qualified', color: '#10b981' },
  { status: 'NQ', label: 'Not Qualified', color: '#ef4444' },
  { status: 'EX', label: 'Excused', color: '#fbbf24' },
  { status: 'ABS', label: 'Absent', color: '#8b5cf6' },
  { status: 'WD', label: 'Withdrawn', color: '#6b7280' },
];

export function computeResultDistribution(
  entries: StatsEntry[],
): ResultDistributionItem[] {
  const scored = entries.filter(isScored);
  if (scored.length === 0) return [];

  const counts = new Map<string, number>();
  for (const entry of scored) {
    counts.set(entry.resultText, (counts.get(entry.resultText) ?? 0) + 1);
  }

  return RESULT_CONFIG.filter((cfg) => (counts.get(cfg.status) ?? 0) > 0).map(
    (cfg) => ({
      status: cfg.status,
      label: cfg.label,
      count: counts.get(cfg.status)!,
      color: cfg.color,
    }),
  );
}

export function computeFastestTimes(
  entries: StatsEntry[],
  limit: number,
): FastestTimeEntry[] {
  return entries
    .filter((e) => isQualified(e) && e.searchTimeSeconds != null)
    .sort((a, b) => a.searchTimeSeconds! - b.searchTimeSeconds!)
    .slice(0, limit)
    .map((e, i) => ({
      rank: i + 1,
      id: e.id,
      dogCallName: e.dogCallName,
      className: e.className,
      classElement: e.classElement,
      classLevel: e.classLevel,
      searchTimeSeconds: e.searchTimeSeconds!,
      showName: e.showName,
    }));
}

export function computeQualificationTrend(
  entries: StatsEntry[],
): TrendPoint[] {
  if (entries.length === 0) return [];

  const grouped = new Map<string, StatsEntry[]>();
  for (const entry of entries) {
    const list = grouped.get(entry.showId) ?? [];
    list.push(entry);
    grouped.set(entry.showId, list);
  }

  const points: TrendPoint[] = [];
  for (const [showId, showEntries] of grouped) {
    let scoredCount = 0;
    let qualifiedCount = 0;
    for (const e of showEntries) {
      if (!isScored(e)) continue;
      scoredCount++;
      if (isQualified(e)) qualifiedCount++;
    }

    points.push({
      showId,
      showName: showEntries[0]!.showName,
      showDate: showEntries[0]!.showDate,
      totalEntries: scoredCount,
      qualifiedCount,
      qualificationRate: scoredCount > 0 ? qualifiedCount / scoredCount : 0,
    });
  }

  // ISO dates (YYYY-MM-DD) are lexicographically sortable
  return points.sort((a, b) =>
    a.showDate < b.showDate ? -1 : a.showDate > b.showDate ? 1 : 0,
  );
}

/** @deprecated Use `computePerDogStats(entries).filter(d => d.isCleanSweep)` instead */
export function findCleanSweepDogs(entries: StatsEntry[]): CleanSweepDog[] {
  return computePerDogStats(entries)
    .filter((d) => d.isCleanSweep)
    .map((d) => ({
      dogId: d.dogId,
      dogCallName: d.dogCallName,
      totalEntries: d.entries,
      qualifiedCount: d.qualifiedCount,
    }));
}
