import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * API-level virtual reader.
 *
 * Readers are the bulk of a show-day workload — roughly 270 of 358 sessions — and
 * 270 Chromium contexts do not fit on sixteen free runners. A reader's load on the
 * backend is HTTP: replication delta polls and PostgREST reads. This issues those,
 * at the real cadence, with its own watermark.
 *
 * It does NOT reuse `syncReplicatedTable`, though that was the first design.
 * `ReplicatedTable` imports a module-level `databaseManager` singleton, so every
 * table instance in one process shares one IndexedDB — and therefore one watermark
 * set. Two hundred and seventy virtual users would have collectively issued about
 * one delta query per table per minute instead of 270, understating reader load by
 * more than two orders of magnitude while appearing to work.
 *
 * Because the queries are restated here rather than shared, `loadVirtualUser
 * .fidelity.test.ts` captures the URLs the real replicated tables put on the wire
 * and asserts these match. A virtual user whose request pattern has drifted from
 * the application measures a fiction.
 */

/** Matches `SYNC_INTERVAL_MS` in packages/replication. */
export const VIRTUAL_USER_SYNC_INTERVAL_MS = 60_000;

export type VirtualUserRole = 'exhibitor' | 'secretary';

export interface LoadVirtualUserOptions {
  readonly supabaseUrl: string;
  readonly anonKey: string;
  readonly accessToken: string;
  readonly showId: string;
  /** Present for scoped class sync; absent drives the unscoped path staff take. */
  readonly trialId?: string;
  /** Present for an exhibitor's owner-scoped dog sync. */
  readonly ownerId?: string;
  readonly role: VirtualUserRole;
  readonly fetchImpl?: typeof fetch;
}

export interface VirtualUserRequestSample {
  readonly table: string;
  readonly durationMs: number;
  readonly ok: boolean;
  readonly status: number;
}

export interface VirtualUserSyncResult {
  readonly samples: readonly VirtualUserRequestSample[];
  readonly rows: number;
}

/**
 * Column list for the classes delta. Mirrors `CLASS_AUTHENTICATED_COLUMN_SELECT`
 * plus the judge-assignment embed. `select('*')` fails 42501 here: authenticated
 * holds no SELECT on `num_hides` (migration 20260731160000), so a star select asks
 * for a column the role cannot read.
 */
const CLASS_SELECT_SUFFIX =
  'judge_assignments!judge_assignments_class_id_fkey(person_id, people!inner(first_name, last_name))';

interface TableWatermark {
  since: number;
}

export class LoadVirtualUser {
  private readonly client: SupabaseClient;
  private readonly watermarks = new Map<string, TableWatermark>();
  /**
   * EVERY poll still running, not just the newest.
   *
   * A sync slower than the interval — the overload case, and the last rehearsal
   * measured ~140s syncs against a 60s cadence — means the next tick starts
   * another while the first is unfinished. A single handle let drain() wait only
   * for the last one, so older requests settled after the metrics and lifecycle
   * were captured and kept reaching shared staging past the workload boundary.
   */
  private readonly inFlight = new Set<Promise<void>>();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly options: LoadVirtualUserOptions,
    private readonly classColumnSelect: string
  ) {
    this.client = createClient(options.supabaseUrl, options.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: { Authorization: `Bearer ${options.accessToken}` },
        ...(options.fetchImpl ? { fetch: options.fetchImpl } : {}),
      },
    });
    // Epoch 0 makes the first pass a full hydration, as a cold device does.
    for (const table of ['classes', 'view_authenticated_entry_results', 'dogs']) {
      this.watermarks.set(table, { since: 0 });
    }
  }

  private sinceIso(table: string): string {
    return new Date(this.watermarks.get(table)?.since ?? 0).toISOString();
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

  /**
   * PostgREST builders are thenables rather than Promises, and the class column
   * list is assembled at runtime so the generated-type parser cannot verify it.
   * Accept the builder's shape structurally.
   */
  private async timed<T>(
    table: string,
    run: () => PromiseLike<{ data: unknown; error: { message: string } | null }>
  ): Promise<{ sample: VirtualUserRequestSample; rows: T[] }> {
    const startedAt = Date.now();
    try {
      const { data, error } = await run();
      const durationMs = Date.now() - startedAt;
      if (error) {
        return { sample: { table, durationMs, ok: false, status: 0 }, rows: [] };
      }
      return {
        sample: { table, durationMs, ok: true, status: 200 },
        rows: (data ?? []) as T[],
      };
    } catch {
      return {
        sample: { table, durationMs: Date.now() - startedAt, ok: false, status: 0 },
        rows: [],
      };
    }
  }

  /** One delta pass across the tables a reader session replicates. */
  async syncOnce(): Promise<VirtualUserSyncResult> {
    const samples: VirtualUserRequestSample[] = [];
    let rows = 0;

    const classes = await this.timed<{ updated_at?: string }>('classes', () => {
      let query = this.client
        .from('classes')
        .select(`${this.classColumnSelect}, ${CLASS_SELECT_SUFFIX}`)
        .gt('updated_at', this.sinceIso('classes'))
        .order('updated_at', { ascending: true });
      if (this.options.trialId) query = query.eq('trial_id', this.options.trialId);
      return query;
    });
    samples.push(classes.sample);
    this.advance('classes', classes.rows);
    rows += classes.rows.length;

    const entries = await this.timed<{ updated_at?: string }>(
      'view_authenticated_entry_results',
      () =>
        this.client
          .from('view_authenticated_entry_results')
          .select('*')
          .gt('updated_at', this.sinceIso('view_authenticated_entry_results'))
          .order('updated_at', { ascending: true })
          .eq('show_id', this.options.showId)
    );
    samples.push(entries.sample);
    this.advance('view_authenticated_entry_results', entries.rows);
    rows += entries.rows.length;

    const dogs = await this.timed<{ updated_at?: string }>('dogs', () => {
      let query = this.client
        .from('dogs')
        .select('*')
        .gt('updated_at', this.sinceIso('dogs'))
        .order('updated_at', { ascending: true });
      // Staff have no owner scope, so their dog sync is unscoped and pulls deltas
      // from every show on the platform. That cost is a thing under test.
      if (this.options.ownerId) query = query.eq('owner_id', this.options.ownerId);
      return query;
    });
    samples.push(dogs.sample);
    this.advance('dogs', dogs.rows);
    rows += dogs.rows.length;

    return { samples, rows };
  }

  start(
    onSync: (result: VirtualUserSyncResult) => void,
    onError?: (error: unknown) => void
  ): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const pending: Promise<void> = this.syncOnce()
        .then(onSync, error => onError?.(error))
        .finally(() => {
          this.inFlight.delete(pending);
        });
      this.inFlight.add(pending);
    }, VIRTUAL_USER_SYNC_INTERVAL_MS);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
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
    // Settling one poll can leave others outstanding, so loop until the set is
    // empty rather than awaiting a single snapshot of it.
    while (this.inFlight.size > 0) {
      await Promise.all([...this.inFlight]);
    }
  }
}
