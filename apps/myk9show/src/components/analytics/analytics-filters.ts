/**
 * Show Stats / Results filters (MYK9-1512). Pure helpers: the URL hook feeds
 * `ShowStatsFilters`, these narrow entries and derive the options each filter offers.
 * Filtering runs on entries the viewer may already see; the withheld-results gate is
 * checked on the UNfiltered set first, so a filter can never hide a withheld row.
 */
import type { ListFilterOption } from '@/components/list-toolkit';
import { isScored, type StatsEntry } from './analytics-utils';

export const SHOW_STATS_FILTER_KEYS = [
  'breed',
  'judge',
  'date',
  'trial',
  'element',
  'level',
] as const;
export type ShowStatsFilterKey = (typeof SHOW_STATS_FILTER_KEYS)[number];
export type ShowStatsFilters = Record<ShowStatsFilterKey, string | null>;

export const EMPTY_SHOW_STATS_FILTERS: ShowStatsFilters = {
  breed: null,
  judge: null,
  date: null,
  trial: null,
  element: null,
  level: null,
};

export const UNKNOWN_BREED = 'Unknown breed';

export function entryBreed(entry: StatsEntry): string {
  return entry.breed?.trim() || UNKNOWN_BREED;
}

export function hasActiveFilters(filters: ShowStatsFilters): boolean {
  return SHOW_STATS_FILTER_KEYS.some(key => filters[key] !== null);
}

export function applyStatsFilters(
  entries: readonly StatsEntry[],
  filters: ShowStatsFilters
): StatsEntry[] {
  return entries.filter(
    entry =>
      (filters.breed === null || entryBreed(entry) === filters.breed) &&
      (filters.judge === null || (entry.judgeIds ?? []).includes(filters.judge)) &&
      (filters.date === null || entry.trialDate === filters.date) &&
      (filters.trial === null || entry.trialId === filters.trial) &&
      (filters.element === null || entry.classElement === filters.element) &&
      (filters.level === null || entry.classLevel === filters.level)
  );
}

function sortedOptions(options: Map<string, string>): ListFilterOption[] {
  return [...options.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** "Trial 2 · Mar 14" style label, falling back to whatever the trial has. */
export function trialLabel(entry: Pick<StatsEntry, 'trialName' | 'trialNumber' | 'trialDate'>) {
  const name = entry.trialName?.trim() || (entry.trialNumber ? `Trial ${entry.trialNumber}` : '');
  const date = entry.trialDate ? formatTrialDate(entry.trialDate) : '';
  return [name, date].filter(Boolean).join(' · ') || 'Trial';
}

export function formatTrialDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export interface StatsFilterOptions {
  breed: ListFilterOption[];
  judge: ListFilterOption[];
  date: ListFilterOption[];
  trial: ListFilterOption[];
  element: ListFilterOption[];
  level: ListFilterOption[];
}

/** Options come from the entries the viewer can see, so nobody is offered a value that matches nothing. */
export function deriveStatsFilterOptions(
  entries: readonly StatsEntry[],
  judgeNames: ReadonlyMap<string, string>
): StatsFilterOptions {
  const breed = new Map<string, string>();
  const judge = new Map<string, string>();
  const date = new Map<string, string>();
  const trial = new Map<string, string>();
  const element = new Map<string, string>();
  const level = new Map<string, string>();

  for (const entry of entries) {
    breed.set(entryBreed(entry), entryBreed(entry));
    for (const id of entry.judgeIds ?? []) judge.set(id, judgeNames.get(id) ?? 'Unknown judge');
    if (entry.trialDate) date.set(entry.trialDate, formatTrialDate(entry.trialDate));
    if (entry.trialId) trial.set(entry.trialId, trialLabel(entry));
    if (entry.classElement) element.set(entry.classElement, entry.classElement);
    if (entry.classLevel) level.set(entry.classLevel, entry.classLevel);
  }

  return {
    breed: sortedOptions(breed),
    judge: sortedOptions(judge),
    // ISO dates sort chronologically; label order would not.
    date: [...date.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([value, label]) => ({ value, label })),
    trial: sortedOptions(trial),
    element: sortedOptions(element),
    level: sortedOptions(level),
  };
}

export interface BreedPerformance {
  breed: string;
  scored: number;
  qualified: number;
  /** 0–1 fraction */
  qualificationRate: number;
}

/** Qualification rate per breed over scored entries, most-scored breeds first. */
export function computeBreedPerformance(
  entries: readonly StatsEntry[],
  limit = 10
): BreedPerformance[] {
  const grouped = new Map<string, { scored: number; qualified: number }>();
  for (const entry of entries) {
    if (!isScored(entry)) continue;
    const row = grouped.get(entryBreed(entry)) ?? { scored: 0, qualified: 0 };
    row.scored++;
    if (entry.resultText === 'Q') row.qualified++;
    grouped.set(entryBreed(entry), row);
  }
  return [...grouped.entries()]
    .map(([breed, { scored, qualified }]) => ({
      breed,
      scored,
      qualified,
      qualificationRate: scored > 0 ? qualified / scored : 0,
    }))
    .sort((a, b) => b.scored - a.scored || a.breed.localeCompare(b.breed))
    .slice(0, limit);
}
