// Pure computation functions for exhibitor analytics.
// No React or Supabase dependencies — designed for unit testing in isolation.

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
  organization?: string;
}

export interface SummaryStats {
  totalEntries: number;
  scoredEntries: number;
  qualifiedCount: number;
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
  qualificationRate: number;
}

export interface CleanSweepDog {
  dogId: string;
  dogCallName: string;
  totalEntries: number;
  qualifiedCount: number;
}

// ── Helpers ────────────────────────────────────────────────────────────

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

function qRate(scored: StatsEntry[]): number {
  if (scored.length === 0) return 0;
  return scored.filter(isQualified).length / scored.length;
}

function qualifiedTimes(entries: StatsEntry[]): number[] {
  return entries
    .filter((e) => isQualified(e) && e.searchTimeSeconds != null)
    .map((e) => e.searchTimeSeconds!);
}

// ── Public functions ───────────────────────────────────────────────────

export function computeSummaryStats(entries: StatsEntry[]): SummaryStats {
  if (entries.length === 0) {
    return {
      totalEntries: 0,
      scoredEntries: 0,
      qualifiedCount: 0,
      qualificationRate: 0,
      bestTime: null,
      bestTimeDogName: null,
      avgTime: null,
      medianTime: null,
    };
  }

  const scored = entries.filter(isScored);
  const qualified = entries.filter(isQualified);
  const qualifiedWithTimes = entries
    .filter((e) => isQualified(e) && e.searchTimeSeconds != null)
    .sort((a, b) => a.searchTimeSeconds! - b.searchTimeSeconds!);
  const times = qualifiedWithTimes.map((e) => e.searchTimeSeconds!);
  const bestEntry = qualifiedWithTimes.length > 0 ? qualifiedWithTimes[0]! : null;

  return {
    totalEntries: entries.length,
    scoredEntries: scored.length,
    qualifiedCount: qualified.length,
    qualificationRate: qRate(scored),
    bestTime: times.length > 0 ? times[0]! : null,
    bestTimeDogName: bestEntry ? bestEntry.dogCallName : null,
    avgTime:
      times.length > 0
        ? times.reduce((sum, t) => sum + t, 0) / times.length
        : null,
    medianTime: times.length > 0 ? median(times) : null,
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
    const scored = dogEntries.filter(isScored);
    const times = qualifiedTimes(dogEntries).sort((a, b) => a - b);
    const qualifiedCount = scored.filter(isQualified).length;

    results.push({
      dogId,
      dogCallName: dogEntries[0]!.dogCallName,
      entries: dogEntries.length,
      qualifiedCount,
      qualificationRate: qRate(scored),
      bestTime: times.length > 0 ? times[0]! : null,
      avgTime:
        times.length > 0
          ? times.reduce((sum, t) => sum + t, 0) / times.length
          : null,
      isCleanSweep: scored.length > 0 && qualifiedCount === scored.length,
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
    const scored = showEntries.filter(isScored);
    const qualifiedCount = scored.filter(isQualified).length;

    points.push({
      showId,
      showName: showEntries[0]!.showName,
      showDate: showEntries[0]!.showDate,
      totalEntries: scored.length,
      qualifiedCount,
      qualificationRate: scored.length > 0 ? qualifiedCount / scored.length : 0,
    });
  }

  return points.sort(
    (a, b) => new Date(a.showDate).getTime() - new Date(b.showDate).getTime(),
  );
}

export function findCleanSweepDogs(entries: StatsEntry[]): CleanSweepDog[] {
  if (entries.length === 0) return [];

  const grouped = new Map<string, StatsEntry[]>();
  for (const entry of entries) {
    const list = grouped.get(entry.dogId) ?? [];
    list.push(entry);
    grouped.set(entry.dogId, list);
  }

  const results: CleanSweepDog[] = [];
  for (const [dogId, dogEntries] of grouped) {
    const scored = dogEntries.filter(isScored);
    const qualifiedCount = scored.filter(isQualified).length;

    if (scored.length > 0 && qualifiedCount === scored.length) {
      results.push({
        dogId,
        dogCallName: dogEntries[0]!.dogCallName,
        totalEntries: dogEntries.length,
        qualifiedCount,
      });
    }
  }

  return results;
}
