import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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

/** Matches `DEFAULT_REMOTE_COUNT_INTERVAL_MS` in packages/replication (fidelity-tested). */
export const REMOTE_COUNT_INTERVAL_MS = 10 * 60_000;

/** Matches `SYNC_INTERVAL_MS` in packages/replication. */
export const VIRTUAL_USER_SYNC_INTERVAL_MS = 60_000;

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
  /** When each table was last counted; absent until its first successful count. */
  private readonly lastCountedAt = new Map<string, number>();
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
  private timer: ReturnType<typeof setInterval> | undefined;

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
      countDue: table => {
        const last = this.lastCountedAt.get(table);
        return (
          this.options.countEveryPass === true ||
          !last ||
          Date.now() - last >= REMOTE_COUNT_INTERVAL_MS
        );
      },
      countTaken: table => {
        this.lastCountedAt.set(table, Date.now());
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
    if (this.timer) return;
    this.timer = setInterval(() => {
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
    }, VIRTUAL_USER_SYNC_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    // Abort AFTER clearing the interval so no new poll can be scheduled.
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
