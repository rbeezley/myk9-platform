import type { DbTrial } from '@/types/database-mappings';

// TrialEditPanel's "Trial Number" field is a dedicated `type="number" min={1}
// max={10}` input, distinct from the trial's free-text `name`. A wide margin
// above that cap still excludes anything that looks like an AKC-style event
// number (e.g. `2026123401`) landing in `trial_number` from the show-creation
// RPC path, which defaults it to the trial's name rather than a sequence.
const EXPLICIT_TRIAL_NUMBER_MAX = 20;

function explicitTrialNumber(trial: DbTrial): number | undefined {
  const raw = trial.trial_number?.trim();
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > EXPLICIT_TRIAL_NUMBER_MAX) {
    return undefined;
  }
  return value;
}

// Trial start times are persisted as free-text "h:mm a" (e.g. "9:00 AM"),
// which does not sort correctly as a plain string across the 12/1 o'clock
// boundary. Parse to minutes-since-midnight for a real chronological compare.
function parseClockTimeMinutes(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return undefined;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem) {
    if (hour < 1 || hour > 12) return undefined;
    hour = (hour % 12) + (meridiem === 'PM' ? 12 : 0);
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return undefined;
  return hour * 60 + minute;
}

type SortKey = readonly [number, number, string];

function sortKeyFor(trial: DbTrial): SortKey {
  const minutes =
    parseClockTimeMinutes(trial.planned_start_time) ??
    parseClockTimeMinutes(trial.actual_start_time) ??
    Number.POSITIVE_INFINITY;
  return [minutes, trial.display_order ?? 0, trial.created_at ?? ''];
}

function compareSortKeys(a: SortKey, b: SortKey): number {
  return a[0] - b[0] || a[1] - b[1] || a[2].localeCompare(b[2]);
}

function sortKeysEqual(a: SortKey, b: SortKey): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

/**
 * This trial's 1-based position among trials sharing its calendar day in the
 * show. Undefined when the day has only one trial, or when the position
 * can't be determined without guessing (MYK9-827: a UKC trial report must
 * tick the box for its own trial).
 *
 * Two-tier rule:
 * 1. If every same-day trial carries a clean, pairwise-distinct explicit
 *    number (see `explicitTrialNumber`), use it directly -- it's what the
 *    secretary typed into "Trial Number", not a guess.
 * 2. Otherwise derive the position from start time, then `display_order`
 *    (the field the show-creation wizard sets to creation sequence), then
 *    `created_at`. A same-day trial that still ties another on every one of
 *    those keys (e.g. both `display_order` 0 or null, no start time set)
 *    returns undefined rather than falling back to an arbitrary UUID compare.
 */
export function computeDayTrialNumber(trial: DbTrial, allTrials: DbTrial[]): number | undefined {
  const sameDay = allTrials.filter(t => t.date === trial.date);
  if (sameDay.length <= 1) return undefined;

  const explicitById = new Map(sameDay.map(t => [t.id, explicitTrialNumber(t)]));
  const explicitValues = sameDay
    .map(t => explicitById.get(t.id))
    .filter((value): value is number => value !== undefined);
  const everyTrialHasAnUnambiguousExplicitNumber =
    explicitValues.length === sameDay.length && new Set(explicitValues).size === sameDay.length;

  if (everyTrialHasAnUnambiguousExplicitNumber) {
    return explicitById.get(trial.id);
  }

  const sorted = [...sameDay].sort((a, b) => compareSortKeys(sortKeyFor(a), sortKeyFor(b)));
  const position = sorted.findIndex(t => t.id === trial.id);
  if (position < 0) return undefined;

  const thisKey = sortKeyFor(sorted[position]);
  const tiedWithPrev = position > 0 && sortKeysEqual(sortKeyFor(sorted[position - 1]), thisKey);
  const tiedWithNext =
    position < sorted.length - 1 && sortKeysEqual(sortKeyFor(sorted[position + 1]), thisKey);
  if (tiedWithPrev || tiedWithNext) return undefined;

  return position + 1;
}
