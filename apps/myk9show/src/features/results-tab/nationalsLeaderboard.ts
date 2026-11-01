/**
 * MYK9-1516: the Nationals leaderboard, ranked from the rows the Results tab already reads.
 *
 * The `nationals_rankings` / `nationals_advancement` tables are not a source: nothing in the app
 * reads or writes them, they are not replicated, and their only policy is staff-only by design
 * (MYK9-93). The ranking key at nationals is `points_earned` on the replicated entry (the same
 * one the coin flip groups on), so this folds those rows per dog, as v3 did per armband.
 *
 * Only RELEASED classes count, so the board never shows a result the Results tab still holds back.
 * Pure on purpose: the component only renders what this returns.
 */
import { isRunnableEntry } from '@/features/_shared/entryAccounting';
import { accountingFields } from '@/pages/secretary/showDeskEntryAvailability';
import type { SecretaryEntry } from '@/services/database/entries';
import { isResultsDisplayEntry, type ResultsClassRow } from './buildResultsClassRows';

/** The nationals run three days; a trial outside that window counts toward the nearest one. */
export const NATIONALS_DAYS = [1, 2, 3] as const;
export type NationalsDay = (typeof NATIONALS_DAYS)[number];

/** Shown in precedence order: the first that applies wins. */
export type NationalsLeaderboardStatus = 'Withdrawn' | 'Eliminated' | 'Finals';

export interface NationalsLeaderboardRow {
  rank: number;
  /** The dog the row is for; an armband may not be assigned yet. */
  dogId: string;
  armband: string | null;
  dogName: string;
  handlerName: string;
  totalPoints: number;
  /** Sum of the recorded times only; an untimed run adds nothing here (see `untimedRuns`). */
  totalTimeSeconds: number;
  /** Scored runs with no usable time. Such a dog ranks behind equal-points dogs with all times. */
  untimedRuns: number;
  /** Points scored on each day; null = nothing scored that day. */
  dayPoints: Record<NationalsDay, number | null>;
  status: NationalsLeaderboardStatus | null;
}

const MS_PER_DAY = 86_400_000;

function dateOnlyMs(date: string | null | undefined): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? '');
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Trial date minus show start date plus 1, clamped to 1 to 3 (an unreadable date is day 1). */
export function competitionDay(
  trialDate: string | null | undefined,
  showStartDate: string | null | undefined
): NationalsDay {
  const trial = dateOnlyMs(trialDate);
  const start = dateOnlyMs(showStartDate);
  if (trial === null || start === null) return 1;
  const day = Math.round((trial - start) / MS_PER_DAY) + 1;
  return Math.min(3, Math.max(1, day)) as NationalsDay;
}

/** Withdrawn, then Eliminated, then Finals, else nothing. */
export function leaderboardStatus(flags: {
  withdrawn: boolean;
  eliminated: boolean;
  finals: boolean;
}): NationalsLeaderboardStatus | null {
  if (flags.withdrawn) return 'Withdrawn';
  if (flags.eliminated) return 'Eliminated';
  if (flags.finals) return 'Finals';
  return null;
}

/**
 * Points descending; at equal points a dog with every run timed ranks ahead of one with any
 * untimed run; then time ascending; armband breaks an exact tie so the order is stable.
 */
export function compareLeaderboard(
  a: Pick<NationalsLeaderboardRow, 'totalPoints' | 'totalTimeSeconds' | 'untimedRuns' | 'armband'>,
  b: Pick<NationalsLeaderboardRow, 'totalPoints' | 'totalTimeSeconds' | 'untimedRuns' | 'armband'>
): number {
  return (
    b.totalPoints - a.totalPoints ||
    Number(a.untimedRuns > 0) - Number(b.untimedRuns > 0) ||
    a.totalTimeSeconds - b.totalTimeSeconds ||
    (a.armband ?? '').localeCompare(b.armband ?? '', undefined, { numeric: true })
  );
}

/**
 * A run with no recorded time: null, undefined, non-finite, or <= 0. A real search never takes 0 s,
 * and a scored NQ is stored as 0 (`inputFormatToDbSeconds('')`), so 0 means "no time entered".
 */
function isUntimedRun(seconds: number | null | undefined): boolean {
  return seconds == null || !Number.isFinite(seconds) || seconds <= 0;
}

/**
 * What the Total Time cell says (MYK9-1573). A dog with untimed runs ranks behind equal-points
 * dogs with every time, so its partial total carries a visible note of the runs it leaves out;
 * a dog with no recorded time at all has no total (null). All text, nothing hover-only.
 */
export function totalTimeLabel(
  row: Pick<NationalsLeaderboardRow, 'totalTimeSeconds' | 'untimedRuns'>
): {
  timeSeconds: number | null;
  untimedNote: string | null;
} {
  if (row.untimedRuns === 0) return { timeSeconds: row.totalTimeSeconds, untimedNote: null };
  const untimedNote =
    row.untimedRuns === 1 ? '1 run has no time' : `${row.untimedRuns} runs have no time`;
  return { timeSeconds: row.totalTimeSeconds > 0 ? row.totalTimeSeconds : null, untimedNote };
}

/** Result statuses that eliminate a dog from the nationals. */
const ELIMINATING_RESULTS: ReadonlySet<string> = new Set(['excused', 'disqualified']);

export interface BuildNationalsLeaderboardInput {
  entries: readonly SecretaryEntry[];
  /** The Results tab's class rows: which classes are released, and the date each ran. */
  classRows: readonly Pick<ResultsClassRow, 'id' | 'trialDate' | 'releasedAt'>[];
  showStartDate: string | null | undefined;
}

/** Withdrawn either way the app records it: the entry status, or a scoring result. */
function isWithdrawnEntry(entry: SecretaryEntry): boolean {
  const fields = accountingFields(entry);
  return [fields.entry_status, fields.result_status].some(
    value => value?.trim().toLowerCase() === 'withdrawn'
  );
}

/** A withdrawal on the entry's lifecycle: a fact about the entry, not a result anyone releases. */
function isLifecycleWithdrawn(entry: SecretaryEntry): boolean {
  return accountingFields(entry).entry_status?.trim().toLowerCase() === 'withdrawn';
}

/**
 * The one visible-set rule for everything the board derives from a dog's entries: a result counts
 * only if its class is released. A lifecycle withdrawal always counts, whatever the release state;
 * every other entry counts only in a released class, so an unreleased score or withdrawal-by-result
 * never reaches Withdrawn, Eliminated or the totals.
 */
export function visibleEntries(
  dogEntries: readonly SecretaryEntry[],
  releasedClassIds: ReadonlySet<string>
): SecretaryEntry[] {
  return dogEntries.filter(
    entry =>
      isLifecycleWithdrawn(entry) ||
      (entry.class_id !== null && releasedClassIds.has(entry.class_id))
  );
}

/**
 * The entries that can rank: exactly the ones the Results class list shows
 * (`isResultsDisplayEntry`), minus a withdrawal recorded as a scoring result. Scores and
 * eliminations read only these, so the board never counts an entry the class list does not.
 */
export function isRankableEntry(entry: SecretaryEntry): boolean {
  return isResultsDisplayEntry(entry) && !isWithdrawnEntry(entry);
}

/**
 * Withdrawn: the dog withdrew from something and has nothing left to run. "Left to run" is the
 * shared entry-accounting rule (`isRunnableEntry`), so this keeps no list of its own. An entry
 * outside the visible set has no visible result, so it is read as not yet run.
 */
export function isDogWithdrawn(
  dogEntries: readonly SecretaryEntry[],
  releasedClassIds: ReadonlySet<string>
): boolean {
  const visible = visibleEntries(dogEntries, releasedClassIds);
  const hidden = dogEntries.filter(entry => !visible.includes(entry));
  return (
    visible.some(isWithdrawnEntry) &&
    !visible.some(entry => !isWithdrawnEntry(entry) && isRunnableEntry(accountingFields(entry))) &&
    !hidden.some(entry =>
      isRunnableEntry({ ...accountingFields(entry), is_scored: false, result_status: 'pending' })
    )
  );
}

/** Eliminated: an excused or disqualified result on a visible rankable entry, scored or not. */
export function isDogEliminated(
  dogEntries: readonly SecretaryEntry[],
  releasedClassIds: ReadonlySet<string>
): boolean {
  return visibleEntries(dogEntries, releasedClassIds).some(
    entry => isRankableEntry(entry) && ELIMINATING_RESULTS.has(entry.result_status ?? '')
  );
}

/** The dog an entry belongs to; an entry with no dog on the read falls back to its armband. */
function dogKeyOf(entry: SecretaryEntry): string {
  const armband = entry.armband?.trim();
  return entry.dog_id ?? entry.dog?.id ?? (armband ? `armband:${armband}` : `entry:${entry.id}`);
}

export function buildNationalsLeaderboard({
  entries,
  classRows,
  showStartDate,
}: BuildNationalsLeaderboardInput): NationalsLeaderboardRow[] {
  const trialDateByReleasedClass = new Map(
    classRows.filter(row => row.releasedAt).map(row => [row.id, row.trialDate] as const)
  );
  const releasedClassIds = new Set(trialDateByReleasedClass.keys());
  const entriesByDog = new Map<string, SecretaryEntry[]>();
  for (const entry of entries) {
    const key = dogKeyOf(entry);
    const dogEntries = entriesByDog.get(key) ?? [];
    dogEntries.push(entry);
    entriesByDog.set(key, dogEntries);
  }
  const rows: Omit<NationalsLeaderboardRow, 'rank'>[] = [];
  for (const [dogId, dogEntries] of entriesByDog) {
    // Totals, time and day points come only from scored, rankable entries in the visible set.
    const scored = visibleEntries(dogEntries, releasedClassIds).filter(
      entry => entry.is_scored === true && entry.class_id !== null && isRankableEntry(entry)
    );
    if (scored.length === 0) continue;
    const row = blankRow(dogId, dogEntries, scored[0]!);
    for (const entry of scored) {
      const points = entry.points_earned ?? 0;
      const day = competitionDay(trialDateByReleasedClass.get(entry.class_id!), showStartDate);
      row.totalPoints += points;
      if (isUntimedRun(entry.search_time_seconds)) row.untimedRuns += 1;
      else row.totalTimeSeconds += entry.search_time_seconds!;
      row.dayPoints[day] = (row.dayPoints[day] ?? 0) + points;
    }
    rows.push({
      ...row,
      // The schema's `qualified_for_finals` is not carried on the entry read, and v3's client
      // aggregation never computed it either, so no dog is marked Finals yet.
      status: leaderboardStatus({
        withdrawn: isDogWithdrawn(dogEntries, releasedClassIds),
        eliminated: isDogEliminated(dogEntries, releasedClassIds),
        finals: false,
      }),
    });
  }
  return rows.sort(compareLeaderboard).map((row, index) => ({ ...row, rank: index + 1 }));
}

function blankRow(
  dogId: string,
  dogEntries: readonly SecretaryEntry[],
  entry: SecretaryEntry
): Omit<NationalsLeaderboardRow, 'rank' | 'status'> {
  const identity = entry.handler_identity;
  return {
    dogId,
    armband: dogEntries.map(item => item.armband?.trim()).find(Boolean) ?? null,
    dogName: entry.dog?.call_name || entry.dog?.name || 'Unknown dog',
    handlerName: identity && identity.source !== 'unknown' ? (identity.name ?? '') : '',
    totalPoints: 0,
    totalTimeSeconds: 0,
    untimedRuns: 0,
    dayPoints: { 1: null, 2: null, 3: null },
  };
}
