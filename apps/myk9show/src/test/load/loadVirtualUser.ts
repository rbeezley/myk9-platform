import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { decideRemoteCount, recordRemoteCountPass } from '@myk9/replication';
import { POSTGREST_MAX_ROWS } from '../../services/replication/postgrestMaxRows';
import {
  PassRecorder,
  type ReaderContext,
  type VirtualUserRequestSample,
} from './loadVirtualUserContext';
import { observingFetch, type ApiErrorObservation } from './loadVirtualUserFetch';
import { runReaderPass } from './loadVirtualUserTables';

export type { VirtualUserRequestSample } from './loadVirtualUserContext';

/**
 * API-level virtual reader.
 *
 * Readers are the bulk of a show-day workload, roughly 270 of 358 sessions, and
 * 270 Chromium contexts do not fit on sixteen free runners. A reader's load on the
 * backend is HTTP: the requests the app's 60 s replication pass makes. This issues
 * those, at the real cadence, with its own watermarks.
 *
 * It does NOT reuse `syncReplicatedTable`, though that was the first design.
 * `ReplicatedTable` imports a module-level `databaseManager` singleton, so every
 * table instance in one process shares one IndexedDB, and therefore one watermark
 * set. Two hundred and seventy virtual users would have collectively issued about
 * one delta query per table per minute instead of 270, understating reader load by
 * more than two orders of magnitude while appearing to work.
 *
 * Because the queries are restated here (`loadVirtualUserTables.ts`) rather than
 * shared, `loadVirtualUser.fidelity.test.ts` runs the REAL replicated tables
 * against a recording server and asserts this reader puts the same requests on the
 * wire. A virtual user whose request pattern has drifted from the application
 * measures a fiction.
 */

/**
 * The no-channel cadence: the app's poll while offline or with no SUBSCRIBED show
 * channel. Matches `SYNC_INTERVAL_MS` in packages/replication.
 */
export const VIRTUAL_USER_SYNC_INTERVAL_MS = 60_000;

/**
 * Matches `ID_SCAN_INTERVAL_MS` in `services/replication/idScanCadence.ts`
 * (restated: that module reaches `@/` aliases this runner does not resolve;
 * `loadVirtualUser.fidelity.test.ts` pins the two).
 */
export const VIRTUAL_USER_ID_SCAN_INTERVAL_MS = 60 * 60_000;

/**
 * The subscribed cadence (MYK9-1305): uniform in [min, max]. Restated, not imported
 * from `providers/syncCadence`, which reaches `@/` aliases this runner does not
 * resolve; `loadVirtualUser.fidelity.test.ts` pins both to the app's exports.
 */
export const VIRTUAL_USER_SLOW_POLL_MIN_MS = 180_000;
export const VIRTUAL_USER_SLOW_POLL_MAX_MS = 300_000;

export type VirtualUserRole = 'exhibitor' | 'secretary';

export interface LoadVirtualUserOptions {
  readonly supabaseUrl: string;
  readonly anonKey: string;
  readonly accessToken: string;
  /**
   * Which role's token this reader carries. It does not change the requests: the
   * app's poll is unscoped, so what each role receives is decided by RLS alone.
   */
  readonly role: VirtualUserRole;
  readonly fetchImpl?: typeof fetch;
  /**
   * Count every pass, as the app does with `replicationCountCadence` off. Default
   * false: the engine's cadence (first pass, then every `REMOTE_COUNT_INTERVAL_MS`).
   */
  readonly countEveryPass?: boolean;
  /**
   * true: the dogs, dog_registrations and clubs id scans run on every pass (the
   * pre-MYK9-1302 behaviour, `features.replicationDogIdCadence` off).
   * false: the app's cadence (the first pass, then every `VIRTUAL_USER_ID_SCAN_INTERVAL_MS`).
   */
  readonly idScanEveryPass?: boolean;
  /**
   * Poll on the subscribed cadence (3 to 5 min, jittered), as an app with a
   * SUBSCRIBED show channel and `replicationSubscribedCadence` on does. Default
   * false: the 60 s no-channel cadence. The reader joins no channel either way.
   */
  readonly subscribedCadence?: boolean;
  /** Draws the slow delay; defaults to Math.random. Test seam. */
  readonly random?: () => number;
  /** Every non-2xx response the reader's fetch saw, retried or not. */
  readonly onApiError?: (observation: ApiErrorObservation) => void;
}

export interface VirtualUserSyncResult {
  readonly samples: readonly VirtualUserRequestSample[];
  readonly rows: number;
}

interface TableWatermark {
  since: number;
}

export class LoadVirtualUser {
  private readonly client: SupabaseClient;
  /** Error-body reads still running; settled before a pass reports. */
  private readonly errorReads = new Set<Promise<void>>();
  private readonly watermarks = new Map<string, TableWatermark>();
  /** The engine's cadence state is keyed by owner object: one per table, per reader. */
  private readonly countOwners = new Map<string, object>();
  /** Rows this reader has ever received per table: an empty replica forces the engine to count every pass. */
  private readonly rowsSeen = new Map<string, number>();
  /** When each table's id scan last completed on this reader (the app's device-session stamp). */
  private readonly idScannedAt = new Map<string, number>();
  /**
   * Every poll still running. The tick guard below keeps this to one at a time,
   * but drain() still waits on whatever is here rather than assuming it.
   *
   * Before the guard, a sync slower than the interval (the overload case; the last
   * rehearsal measured ~140s syncs against a 60s cadence) let the next tick start
   * another while the first was unfinished, so a single handle let drain() wait
   * only for the last one and older requests settled after the metrics and
   * lifecycle were captured, still reaching shared staging past the workload
   * boundary.
   */
  private readonly inFlight = new Set<Promise<void>>();
  /** Ticks that fired while the previous pass was still running, and so did nothing. */
  private skipped = 0;

  /**
   * Cancels outstanding requests at the workload boundary.
   *
   * Draining by WAITING was itself a defect: a fetch that never settles blocks
   * until the shard step timeout, so the run writes no artifact at all; the
   * wait also folds the poll's latency into elapsedMs and lets requests keep
   * reaching shared staging after the approved window closed. Aborting ends all
   * three: the boundary is a boundary, not a request to please finish.
   */
  private readonly abort = new AbortController();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;

  constructor(
    private readonly options: LoadVirtualUserOptions,
    private readonly classColumnSelect: string
  ) {
    this.client = createClient(options.supabaseUrl, options.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: { Authorization: `Bearer ${options.accessToken}` },
        fetch: observingFetch(
          options.fetchImpl ?? ((...args) => fetch(...args)),
          observation => options.onApiError?.(observation),
          this.abort.signal,
          this.errorReads
        ),
      },
    });
  }

  /** Ticks skipped because the previous pass had not finished. */
  get skippedPasses(): number {
    return this.skipped;
  }

  /** Epoch 0 (an unseen table) makes the first pass a full hydration, as a cold device does. */
  private sinceIso(table: string, bufferMs: number): string {
    const watermark = this.watermarks.get(table)?.since ?? 0;
    // The engine's overlap: re-read a little before the watermark so a row
    // committed late behind it is not missed.
    return new Date(watermark > bufferMs ? watermark - bufferMs : 0).toISOString();
  }

  private advance(table: string, rows: readonly { updated_at?: string }[]): void {
    // Anchor to the maximum server `updated_at`, never the client clock: a clock
    // ahead of the server would skip rows written in between.
    let max = this.watermarks.get(table)?.since ?? 0;
    for (const row of rows) {
      const parsed = row.updated_at ? Date.parse(row.updated_at) : Number.NaN;
      if (Number.isFinite(parsed) && parsed > max) max = parsed;
    }
    this.watermarks.set(table, { since: max });
    this.rowsSeen.set(table, (this.rowsSeen.get(table) ?? 0) + rows.length);
  }

  /** One pass across the tables the app's poll replicates, all at once as the app does. */
  async syncOnce(): Promise<VirtualUserSyncResult> {
    const recorder = new PassRecorder(this.abort.signal);
    const context: ReaderContext = {
      client: this.client,
      signal: this.abort.signal,
      classColumnSelect: this.classColumnSelect,
      sinceIso: (table, bufferMs) => this.sinceIso(table, bufferMs),
      advance: (table, rows) => this.advance(table, rows),
      countGate: table => {
        let owner = this.countOwners.get(table);
        if (!owner) {
          owner = {};
          this.countOwners.set(table, owner);
        }
        // The engine's own forced count: an empty local replica counts every pass.
        const forced = (this.rowsSeen.get(table) ?? 0) === 0;
        const decision = decideRemoteCount(owner, undefined, forced, {
          ...(this.options.countEveryPass ? { everyPass: true } : {}),
        });
        return {
          count: decision.count,
          record: (counted, fetchedRows) =>
            recordRemoteCountPass(
              owner,
              undefined,
              { ...decision, count: counted },
              fetchedRows,
              POSTGREST_MAX_ROWS
            ),
        };
      },
      idScanGate: table => {
        const stamp = this.idScannedAt.get(table);
        const now = Date.now();
        const scan =
          this.options.idScanEveryPass === true ||
          stamp === undefined ||
          now < stamp ||
          now - stamp >= VIRTUAL_USER_ID_SCAN_INTERVAL_MS;
        return {
          scan,
          record: () => {
            this.idScannedAt.set(table, Date.now());
          },
        };
      },
      tally: rows => {
        recorder.rows += rows;
      },
      request: (label, run) => recorder.request(label, run),
    };
    await runReaderPass(context);
    await Promise.allSettled([...this.errorReads]);
    return { samples: recorder.samples, rows: recorder.rows };
  }

  start(
    onSync: (result: VirtualUserSyncResult) => void,
    onError?: (error: unknown) => void,
    onSkip?: () => void
  ): void {
    if (this.running) return;
    this.running = true;
    const arm = () => {
      this.timer = setTimeout(() => {
        tick();
        if (this.running) arm();
      }, this.nextDelayMs());
    };
    const tick = () => {
      // The app never overlaps passes: `ReplicationSyncProvider` returns at once
      // while one is in flight. A tick that fires into a slow pass is dropped, and
      // counted, so a struggling database cannot make the harness send more than
      // a device would.
      if (this.inFlight.size > 0) {
        this.skipped += 1;
        onSkip?.();
        return;
      }
      const pending: Promise<void> = this.syncOnce()
        .then(onSync, error => onError?.(error))
        .finally(() => {
          this.inFlight.delete(pending);
        });
      this.inFlight.add(pending);
    };
    arm();
  }

  private nextDelayMs(): number {
    if (!this.options.subscribedCadence) return VIRTUAL_USER_SYNC_INTERVAL_MS;
    const draw = (this.options.random ?? Math.random)();
    return (
      VIRTUAL_USER_SLOW_POLL_MIN_MS +
      Math.floor(draw * (VIRTUAL_USER_SLOW_POLL_MAX_MS - VIRTUAL_USER_SLOW_POLL_MIN_MS + 1))
    );
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    // Abort AFTER clearing the timer so no new poll can be scheduled.
    if (!this.abort.signal.aborted) this.abort.abort();
  }

  /**
   * Settles a poll that was already running when stop() was called.
   *
   * stop() only clears future ticks; the request in flight resolves afterwards.
   * Without this its samples miss the observation and its failure lands after the
   * fleet has already reported outcomes — most likely at the 600 s boundary,
   * since the cadence is 60 s (MYK9-126).
   */
  async drain(): Promise<void> {
    // Bounded because stop() aborted every outstanding request: these settle as
    // AbortErrors rather than hanging. Looping because settling one poll can
    // leave others outstanding.
    while (this.inFlight.size > 0) {
      await Promise.all([...this.inFlight]);
    }
  }
}
