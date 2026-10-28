/**
 * Per-show cache for the four server-derived values a class row carries offline
 * (visibility cascade, hide count, max-time rule, judge name), MYK9-1360.
 *
 * Every classes delta used to re-run about eight lookups on every subscribed device, and every
 * score bumps `classes.updated_at` (`refresh_class_scoring_state`), so each score made each
 * device re-ask for values that change rarely during a show. Results are kept per show for
 * `CLASS_ENRICHMENT_TTL_MS`; a delta whose classes are all known and fresh makes no request.
 *
 * Invalidation: `invalidateClassEnrichment()` is called by a full sync, a role/account
 * boundary, a local write to the tables the values derive from (judge assignments, visibility
 * settings, a class's element/level/section) and clears everything. An account change also
 * misses on its own, because the key carries the signed-in account. Anything changed elsewhere
 * reaches the device when the TTL runs out.
 *
 * INTENT: a miss or a failed read never breaks class replication. A failed resolver is not
 * cached, so it is retried on the next delta, and the caller keeps the best-effort catch shape.
 */
import { logger } from '@myk9/core';
import { readPersistedAuthUserId } from '@/services/database/persistedAuthUserId';
import type { ShareRead } from '@/services/database/_shared/shareInFlight';
import type { JudgeNameParts } from '@/services/database/_shared/judgeNamesByClass';
import type { Database } from '@/types/supabase';
import {
  resolveVisibilityForClassRows,
  type ResolvedClassVisibility,
} from './resolveClassVisibility';
import { resolveHideCountsForClassRows } from './resolveClassHideCounts';
import { resolveJudgeNamesForClassRows } from './resolveClassJudgeNames';
import {
  resolveTimeLimitRulesForClassRows,
  type TimeLimitRule,
} from './resolveClassTimeLimitRules';
import { readClassTrials, distinctTrialIds, type ClassTrialRow } from './resolveClassTrials';

type ClassRow = Database['public']['Tables']['classes']['Row'];

/** How long a show's enrichment is trusted. A judge or visibility change lands within this. */
export const CLASS_ENRICHMENT_TTL_MS = 5 * 60 * 1000;

/** The four per-class maps `ReplicatedClassesTable` merges onto each synced row. */
export interface ClassEnrichment {
  visibility: Map<string, ResolvedClassVisibility>;
  hideCounts: Map<string, number>;
  timeLimitRules: Map<string, TimeLimitRule>;
  judges: Map<string, JudgeNameParts | null>;
}

interface CachedClass {
  /** What the values were resolved from; a class edited since is a miss. */
  signature: string;
  visibility: ResolvedClassVisibility;
  hideCount: number | undefined;
  timeLimitRule: TimeLimitRule | undefined;
  judge: JudgeNameParts | null;
}

interface ShowEntry {
  userId: string;
  showId: string;
  storedAt: number;
  classes: Map<string, CachedClass>;
}

const entries = new Map<string, ShowEntry>();
/** A trial never changes show, so this survives until a full invalidation. */
const showByTrial = new Map<string, string | null>();
/** Bumped by every invalidation, so a read that started before it never writes back. */
let generation = 0;

const entryKey = (userId: string, showId: string): string => `${userId}:${showId}`;
const nowMs = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
/** The class-row columns the cached values derive from (rule lookup keys and time limits). */
const signatureOf = (row: ClassRow): string =>
  JSON.stringify([
    row.trial_id,
    row.element,
    row.level,
    row.section,
    row.time_limit_seconds,
    row.time_limit_area2_seconds,
    row.time_limit_area3_seconds,
  ]);

/** Drop one show's cached enrichment, or everything when no show is named. */
export function invalidateClassEnrichment(showId?: string): void {
  generation += 1;
  if (showId === undefined) {
    entries.clear();
    showByTrial.clear();
    return;
  }
  for (const [key, entry] of entries) {
    if (entry.showId === showId) entries.delete(key);
  }
}

/**
 * A remote change to judge assignments reached this device: drop those shows (all of them when
 * a row names no show), so the next classes delta asks for the new judge names.
 */
export function invalidateClassEnrichmentForShows(
  showIds: ReadonlyArray<string | null | undefined>
): void {
  if (showIds.length === 0) return;
  if (showIds.some(showId => !showId)) invalidateClassEnrichment();
  else new Set(showIds).forEach(showId => invalidateClassEnrichment(showId as string));
}

/** Class fields whose change alters an enrichment input; a status or score edit is not one. */
const ENRICHMENT_INPUT_FIELDS = [
  'trialId',
  'element',
  'level',
  'section',
  'visibilityPreset',
  'selfCheckinEnabled',
  'timeLimitRule',
] as const;

/** True when a local class write changes something the cached values derive from. */
export function affectsClassEnrichment(updates: object): boolean {
  return ENRICHMENT_INPUT_FIELDS.some(field => field in updates);
}

export interface ClassEnrichmentDeps {
  shareRead: ShareRead;
  /** The max-time rules already on this device, used when the live lookup fails. */
  localTimeLimitRules: (ids: string[]) => Promise<Map<string, TimeLimitRule>>;
  tableName: string;
}

/**
 * MYK9-1451: thrown when the hide-count lookup (official RPC, public rules, or the trials read
 * under them) failed. An empty answer from a failed lookup is indistinguishable from "this class
 * has no count", so the caller must keep the counts it already saved instead of taking this one.
 */
export class HideCountLookupFailedError extends Error {
  /** Everything else that did resolve, so a caller that must still produce rows can use it. */
  readonly enrichment: ClassEnrichment;
  constructor(enrichment: ClassEnrichment) {
    super('Hide-count lookup failed; saved counts are kept and the lookup is retried.');
    this.name = 'HideCountLookupFailedError';
    this.enrichment = enrichment;
  }
}

interface ResolveOutcome {
  enrichment: ClassEnrichment;
  /** True when the hide-count lookup failed in any part (RPC, rules, trials). */
  hideCountsFailed: boolean;
  /** False when any lookup threw, so its (partial) answer must not be cached. */
  clean: boolean;
}

async function runResolvers(
  rows: ClassRow[],
  trials: ClassTrialRow[] | undefined,
  deps: ClassEnrichmentDeps
): Promise<ResolveOutcome> {
  let clean = true;
  let hideCountsFailed = false;
  const markHideCountsFailed = () => {
    clean = false;
    hideCountsFailed = true;
  };
  // A resolver that logs and skips a failed read still answers; that answer is partial.
  const markUnclean = () => {
    clean = false;
  };
  const failed =
    <T>(message: string, fallback: T) =>
    () => {
      clean = false;
      logger.warn(`[${deps.tableName}] ${message}`, 'replication');
      return fallback;
    };
  const [visibility, hideCounts, timeLimitRules, judges] = await Promise.all([
    // Best-effort: failure must not break class replication.
    resolveVisibilityForClassRows(rows, trials).catch(
      failed(
        'Visibility resolve failed; popover values may be stale',
        new Map<string, ResolvedClassVisibility>()
      )
    ),
    // Public fixed totals come from registry rules; protected judge-set totals only from the
    // show-scoped official RPC. Both are merged so the caller keeps the count it may see.
    resolveHideCountsForClassRows(rows, deps.shareRead, trials, markHideCountsFailed).catch(() => {
      markHideCountsFailed();
      logger.warn(
        `[${deps.tableName}] Hide-count resolve failed; saved counts are kept and retried next sync`,
        'replication'
      );
      return new Map<string, number>();
    }),
    // MYK9-1086: a failed lookup must not read as "no rule", so carry the rule already on this
    // device into the synced row.
    (async () => {
      const rules = await resolveTimeLimitRulesForClassRows(rows, trials).catch(() => null);
      if (rules) return rules;
      clean = false;
      return deps.localTimeLimitRules(rows.map(row => String(row.id)));
    })(),
    // MYK9-494: names come from get_show_judges, never a `people` embed.
    resolveJudgeNamesForClassRows(rows, deps.shareRead, trials, markUnclean).catch(
      failed(
        'Judge-name resolve failed; cached names are retained',
        new Map<string, JudgeNameParts | null>()
      )
    ),
  ]);
  return {
    enrichment: { visibility, hideCounts, timeLimitRules, judges },
    clean,
    hideCountsFailed,
  };
}

function isFresh(entry: ShowEntry | undefined, userId: string, at: number): entry is ShowEntry {
  return !!entry && entry.userId === userId && at - entry.storedAt < CLASS_ENRICHMENT_TTL_MS;
}

/** Remember what was just resolved, per show, for the classes a later delta will repeat. */
function remember(
  rows: ClassRow[],
  { enrichment }: ResolveOutcome,
  userId: string,
  startedGeneration: number
): void {
  // Another account signed in, or an invalidation landed, while the lookups were on the wire.
  if (generation !== startedGeneration || (readPersistedAuthUserId() ?? 'anon') !== userId) return;
  const at = nowMs();
  for (const [key, entry] of entries) {
    if (entry.userId !== userId) entries.delete(key);
  }
  for (const row of rows) {
    const showId = row.trial_id ? showByTrial.get(row.trial_id) : undefined;
    const id = String(row.id);
    // `has` vs `get`: an absent judge or visibility means the lookup never answered for this
    // class, which must be asked again rather than remembered as "no judge".
    if (!showId || !enrichment.judges.has(id) || !enrichment.visibility.has(id)) continue;
    const key = entryKey(userId, showId);
    let entry = entries.get(key);
    if (!isFresh(entry, userId, at)) {
      entry = { userId, showId, storedAt: at, classes: new Map() };
      entries.set(key, entry);
    }
    entry.classes.set(id, {
      signature: signatureOf(row),
      visibility: enrichment.visibility.get(id)!,
      hideCount: enrichment.hideCounts.get(id),
      timeLimitRule: enrichment.timeLimitRules.get(id),
      judge: enrichment.judges.get(id) ?? null,
    });
  }
}

/**
 * The enrichment for these class rows: cached values for classes of a fresh show entry, the
 * four lookups (one `trials` read, shared) for everything else. The trial-to-show map is itself
 * cached, so a delta of known classes issues no request at all.
 */
export async function resolveClassEnrichment(
  rows: ClassRow[],
  deps: ClassEnrichmentDeps
): Promise<ClassEnrichment> {
  const userId = readPersistedAuthUserId() ?? 'anon';
  const startedGeneration = generation;
  let trials: ClassTrialRow[] | undefined;
  if (distinctTrialIds(rows).some(id => !showByTrial.has(id))) {
    trials = await readClassTrials(rows);
    // A failed read leaves each resolver to read `trials` itself, uncached, as before.
    if (!trials) {
      const outcome = await runResolvers(rows, undefined, deps);
      if (outcome.hideCountsFailed) throw new HideCountLookupFailedError(outcome.enrichment);
      return outcome.enrichment;
    }
    for (const trial of trials) showByTrial.set(trial.id, trial.show_id);
  }

  const at = nowMs();
  const result: ClassEnrichment = {
    visibility: new Map(),
    hideCounts: new Map(),
    timeLimitRules: new Map(),
    judges: new Map(),
  };
  const missed: ClassRow[] = [];
  for (const row of rows) {
    const showId = row.trial_id ? showByTrial.get(row.trial_id) : undefined;
    const entry = showId ? entries.get(entryKey(userId, showId)) : undefined;
    const id = String(row.id);
    const hit = isFresh(entry, userId, at) ? entry.classes.get(id) : undefined;
    if (!hit || hit.signature !== signatureOf(row)) {
      missed.push(row);
      continue;
    }
    result.visibility.set(id, hit.visibility);
    result.judges.set(id, hit.judge);
    if (hit.hideCount !== undefined) result.hideCounts.set(id, hit.hideCount);
    if (hit.timeLimitRule) result.timeLimitRules.set(id, hit.timeLimitRule);
  }
  if (missed.length === 0) return result;

  const outcome = await runResolvers(
    missed,
    trials && missed.length === rows.length ? trials : await readClassTrials(missed),
    deps
  );
  if (outcome.clean) remember(missed, outcome, userId, startedGeneration);
  const fresh = outcome.enrichment;
  fresh.visibility.forEach((value, id) => result.visibility.set(id, value));
  fresh.hideCounts.forEach((value, id) => result.hideCounts.set(id, value));
  fresh.timeLimitRules.forEach((value, id) => result.timeLimitRules.set(id, value));
  fresh.judges.forEach((value, id) => result.judges.set(id, value));
  if (outcome.hideCountsFailed) throw new HideCountLookupFailedError(result);
  return result;
}
