/**
 * Cadence of the per-table remote row count (MYK9-1301).
 *
 * The engine compares a `count: exact` HEAD with the local rows to detect a
 * partial replica (MYK9-752) and a server-side hard delete (MYK9-775). Sending
 * it on every 60 s pass dominated show-day statement time, so it runs on a
 * slower cadence instead. The 24 h forced full sync is unaffected.
 */

import { countCoveredRows } from './replicaCoverage';
import type { SyncScope } from './syncReplicatedTable.types';

/** Default gap between counts for one table scope: about ten minutes. */
export const DEFAULT_REMOTE_COUNT_INTERVAL_MS = 10 * 60_000;

export interface RemoteCountCadenceConfig {
  intervalMs: number;
  /** true restores the pre-MYK9-1301 behaviour: count on every pass. */
  everyPass: boolean;
}

export interface ShouldCountRemoteRowsInput {
  lastCountedAt: number | undefined;
  now: number;
  intervalMs: number;
  countEveryPass: boolean;
  reconnectEpoch: number;
  lastCountedEpoch: number | undefined;
  previousDeltaWasFullPage: boolean;
}

/** Pure rule: true when this pass must send the count. */
export function shouldCountRemoteRows(input: ShouldCountRemoteRowsInput): boolean {
  if (input.countEveryPass) return true;
  if (!input.lastCountedAt) return true;
  // The clock is Date.now(): a device clock that moves BACKWARD must never
  // suppress the count past its bound (a one-hour correction would otherwise
  // hold it for seventy minutes), so a now before the last count is "due".
  if (input.now < input.lastCountedAt) return true;
  if (input.now - input.lastCountedAt >= input.intervalMs) return true;
  if (input.reconnectEpoch !== input.lastCountedEpoch) return true;
  return input.previousDeltaWasFullPage;
}

let config: RemoteCountCadenceConfig = {
  intervalMs: DEFAULT_REMOTE_COUNT_INTERVAL_MS,
  everyPass: false,
};
let reconnectEpoch = 0;

export function configureRemoteCountCadence(next: {
  intervalMs?: number;
  everyPass?: boolean;
}): void {
  config = {
    intervalMs:
      next.intervalMs !== undefined && Number.isFinite(next.intervalMs) && next.intervalMs >= 0
        ? next.intervalMs
        : config.intervalMs,
    everyPass: next.everyPass ?? config.everyPass,
  };
}

export function getRemoteCountCadence(): Readonly<RemoteCountCadenceConfig> {
  return config;
}

/** A realtime channel re-subscribed or the device came back online: the next pass of every table counts. */
export function markRealtimeReconnected(): void {
  reconnectEpoch += 1;
}

export function getRealtimeReconnectEpoch(): number {
  return reconnectEpoch;
}

export function resetRemoteCountCadenceForTests(): void {
  config = { intervalMs: DEFAULT_REMOTE_COUNT_INTERVAL_MS, everyPass: false };
  reconnectEpoch = 0;
}

interface RemoteCountState {
  lastCountedAt?: number;
  lastCountedEpoch?: number;
  lastDeltaWasFullPage?: boolean;
}

// In memory, per table instance and scope, not in SyncMetadata: per-scope
// metadata is merged by the cache's scope-routing logic, and a reload starting
// empty only means the first pass of a session counts, the safe direction.
const states = new WeakMap<object, Map<string, RemoteCountState>>();

function stateFor(owner: object, scopeValue: string | undefined): RemoteCountState {
  let byScope = states.get(owner);
  if (!byScope) {
    byScope = new Map();
    states.set(owner, byScope);
  }
  const key = scopeValue ?? '';
  let state = byScope.get(key);
  if (!state) {
    state = {};
    byScope.set(key, state);
  }
  return state;
}

export interface RemoteCountDecision {
  count: boolean;
  /** Reconnect epoch read when deciding; stored if this pass counts. */
  epoch: number;
}

/** Decide whether this pass counts; `forced` covers a full sync already owed. */
export function decideRemoteCount(
  owner: object,
  scopeValue: string | undefined,
  forced: boolean,
  /** Per-call override so a caller (the load harness) never mutates the global config. */
  overrides?: { everyPass?: boolean }
): RemoteCountDecision {
  const state = stateFor(owner, scopeValue);
  const count =
    forced ||
    shouldCountRemoteRows({
      lastCountedAt: state.lastCountedAt,
      now: Date.now(),
      intervalMs: config.intervalMs,
      countEveryPass: overrides?.everyPass ?? config.everyPass,
      reconnectEpoch,
      lastCountedEpoch: state.lastCountedEpoch,
      previousDeltaWasFullPage: state.lastDeltaWasFullPage === true,
    });
  return { count, epoch: reconnectEpoch };
}

/** After a successful pass: remember when it counted and whether its delta filled a page. */
export function recordRemoteCountPass(
  owner: object,
  scopeValue: string | undefined,
  decision: RemoteCountDecision,
  fetchedRows: number,
  remotePageSize: number | undefined
): void {
  const state = stateFor(owner, scopeValue);
  if (decision.count) {
    state.lastCountedAt = Date.now();
    state.lastCountedEpoch = decision.epoch;
  }
  // A full page is count debt: it stays owed until a count SUCCEEDS, so a count
  // that failed on the triggered pass is not forgiven by a later short delta.
  const fullPage = remotePageSize !== undefined && fetchedRows >= remotePageSize;
  state.lastDeltaWasFullPage = fullPage || (state.lastDeltaWasFullPage === true && !decision.count);
}

export interface RemoteCountPass {
  /** The adapter's raw count, or undefined when this pass skipped it or it failed. */
  rawCount: number | undefined;
  /** The cadence skipped a count the adapter could have made. */
  skipped: boolean;
  /** Call after a successful pass with the rows its fetch returned. */
  record(fetchedRows: number, remotePageSize: number | undefined): void;
}

/** Decide, and when due run, this pass's remote count. */
export async function beginRemoteCountPass(
  owner: object,
  adapter: {
    getRemoteRowCount?: (context: {
      scope: SyncScope;
      signal?: AbortSignal;
    }) => Promise<number | undefined>;
  },
  scope: SyncScope,
  forced: boolean,
  signal?: AbortSignal
): Promise<RemoteCountPass> {
  const decision = decideRemoteCount(owner, scope.value, forced);
  const rawCount = decision.count
    ? await adapter.getRemoteRowCount?.(signal ? { scope, signal } : { scope })
    : undefined;
  // A failed count (undefined) must not burn the window or the reconnect epoch.
  const counted = decision.count && typeof rawCount === 'number' && Number.isFinite(rawCount);
  return {
    rawCount,
    skipped: !decision.count && adapter.getRemoteRowCount !== undefined,
    record: (fetchedRows, remotePageSize) =>
      recordRemoteCountPass(
        owner,
        scope.value,
        { ...decision, count: counted },
        fetchedRows,
        remotePageSize
      ),
  };
}

/**
 * The replica holds fewer covered rows than the last count recorded: an
 * acknowledged delete. The count is due now so `expectedRemoteRows` stays true
 * for readers that compare it with the local rows. Growth never forces a count.
 */
export function coverageFell(
  localRows: readonly { id: string }[],
  lastExpectedRemoteRows: number | undefined
): boolean {
  // Pending deletes are not read here (the engine reads them after the count, so
  // the count and that read stay ordered): a queued delete costs an extra count
  // until it uploads, never a missed one.
  return (
    lastExpectedRemoteRows !== undefined && countCoveredRows(localRows) < lastExpectedRemoteRows
  );
}
