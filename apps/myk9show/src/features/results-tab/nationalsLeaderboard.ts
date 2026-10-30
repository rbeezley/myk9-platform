/**
 * MYK9-1516: the Nationals leaderboard, ranked from the rows the Results tab already reads.
 *
 * The `nationals_rankings` / `nationals_advancement` tables are not a source: nothing in the app
 * reads or writes them, they are not replicated, and their only policy is staff-only by design
 * (MYK9-93). The ranking key at nationals is `points_earned` on the replicated entry (the same
 * one the coin flip groups on), so this folds those rows per armband, as v3 did.
 *
 * Only RELEASED classes count, so the board never shows a result the Results tab still holds back.
 * Pure on purpose: the component only renders what this returns.
 */
import type { SecretaryEntry } from '@/services/database/entries';
import type { ResultsClassRow } from './buildResultsClassRows';

/** The nationals run three days; a trial outside that window counts toward the nearest one. */
export const NATIONALS_DAYS = [1, 2, 3] as const;
export type NationalsDay = (typeof NATIONALS_DAYS)[number];

/** Shown in precedence order: the first that applies wins. */
export type NationalsLeaderboardStatus = 'Withdrawn' | 'Eliminated' | 'Finals';

export interface NationalsLeaderboardRow {
  rank: number;
  armband: string;
  dogName: string;
  handlerName: string;
  totalPoints: number;
  totalTimeSeconds: number;
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

/** Points descending, then time ascending; armband breaks an exact tie so the order is stable. */
export function compareLeaderboard(
  a: Pick<NationalsLeaderboardRow, 'totalPoints' | 'totalTimeSeconds' | 'armband'>,
  b: Pick<NationalsLeaderboardRow, 'totalPoints' | 'totalTimeSeconds' | 'armband'>
): number {
  return (
    b.totalPoints - a.totalPoints ||
    a.totalTimeSeconds - b.totalTimeSeconds ||
    a.armband.localeCompare(b.armband, undefined, { numeric: true })
  );
}

/** Total time as mm:ss. */
export function formatLeaderboardTime(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  return `${String(minutes).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

const ELIMINATING_RESULTS: ReadonlySet<string> = new Set(['excused', 'disqualified']);

interface Draft {
  row: Omit<NationalsLeaderboardRow, 'rank' | 'status'>;
  eliminated: boolean;
}

/** A class-level withdrawal: the entry (one class) is out, not necessarily the dog. */
function isWithdrawnEntry(entry: SecretaryEntry): boolean {
  return entry.entry_status === 'withdrawn' || entry.result_status === 'withdrawn';
}

export interface BuildNationalsLeaderboardInput {
  entries: readonly SecretaryEntry[];
  /** The Results tab's class rows: which classes are released, and the date each ran. */
  classRows: readonly Pick<ResultsClassRow, 'id' | 'trialDate' | 'releasedAt'>[];
  showStartDate: string | null | undefined;
}

export function buildNationalsLeaderboard({
  entries,
  classRows,
  showStartDate,
}: BuildNationalsLeaderboardInput): NationalsLeaderboardRow[] {
  const trialDateByReleasedClass = new Map(
    classRows.filter(row => row.releasedAt).map(row => [row.id, row.trialDate] as const)
  );
  // Entry status is per class: a dog is Withdrawn only when none of its entries is still in.
  const stillEntered = new Set<string>();
  for (const entry of entries) {
    const armband = entry.armband?.trim();
    if (armband && !isWithdrawnEntry(entry)) stillEntered.add(armband);
  }
  const drafts = new Map<string, Draft>();
  for (const entry of entries) {
    const armband = entry.armband?.trim();
    const releasedDate = entry.class_id ? trialDateByReleasedClass.get(entry.class_id) : undefined;
    if (!armband || entry.is_scored !== true || releasedDate === undefined) continue;
    let draft = drafts.get(armband);
    if (!draft) {
      draft = blankDraft(armband, entry);
      drafts.set(armband, draft);
    }
    const points = entry.points_earned ?? 0;
    const day = competitionDay(releasedDate, showStartDate);
    draft.row.totalPoints += points;
    draft.row.totalTimeSeconds += entry.search_time_seconds ?? 0;
    draft.row.dayPoints[day] = (draft.row.dayPoints[day] ?? 0) + points;
    if (entry.result_status && ELIMINATING_RESULTS.has(entry.result_status)) {
      draft.eliminated = true;
    }
  }
  return [...drafts.values()]
    .map(draft => ({
      ...draft.row,
      // The schema's `qualified_for_finals` is not carried on the entry read, and v3's client
      // aggregation never computed it either, so no dog is marked Finals yet.
      status: leaderboardStatus({
        withdrawn: !stillEntered.has(draft.row.armband),
        eliminated: draft.eliminated,
        finals: false,
      }),
    }))
    .sort(compareLeaderboard)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function blankDraft(armband: string, entry: SecretaryEntry): Draft {
  const identity = entry.handler_identity;
  return {
    eliminated: false,
    row: {
      armband,
      dogName: entry.dog?.call_name || entry.dog?.name || 'Unknown dog',
      handlerName: identity && identity.source !== 'unknown' ? (identity.name ?? '') : '',
      totalPoints: 0,
      totalTimeSeconds: 0,
      dayPoints: { 1: null, 2: null, 3: null },
    },
  };
}
