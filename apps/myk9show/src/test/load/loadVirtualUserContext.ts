import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * What one virtual-reader pass shares across its table queries: the client, the
 * abort signal, the per-user watermarks and the request recorder.
 *
 * Nothing here may import application code. The harness is loaded by Playwright
 * under Node, where `import.meta.env` does not exist, and every app module that
 * reaches `supabaseClient` reads it. The queries are restated in
 * `loadVirtualUserTables.ts`; `loadVirtualUser.fidelity.test.ts` is what keeps the
 * restatement honest.
 */

export interface VirtualUserRequestSample {
  readonly table: string;
  readonly durationMs: number;
  readonly ok: boolean;
  readonly status: number;
}

/** A PostgREST builder's result, structurally: builders are thenables, not Promises. */
interface PostgrestResult {
  readonly data: unknown;
  readonly count?: number | null;
  readonly error: { readonly message: string } | null;
}

export interface RequestOutcome<T> {
  /** False when the request failed OR was cancelled by the workload boundary. */
  readonly ok: boolean;
  readonly rows: T[];
  readonly count: number | null;
}

export interface ReaderContext {
  readonly client: SupabaseClient;
  readonly signal: AbortSignal;
  /** Column list for the classes delta, mirroring the application's own. */
  readonly classColumnSelect: string;
  /** ISO lower bound for a table's delta: its watermark less the table's overlap buffer. */
  sinceIso(table: string, bufferMs: number): string;
  /** Move a table's watermark to the newest server `updated_at` in `rows`. */
  advance(table: string, rows: readonly { updated_at?: string }[]): void;
  /** Count rows a pass downloaded, for the pass result. */
  tally(rows: number): void;
  /** Issue one request, record a sample for it, and never throw. */
  request<T>(label: string, run: () => PromiseLike<PostgrestResult>): Promise<RequestOutcome<T>>;
}

const FAILED = { ok: false, rows: [], count: null } as const;

export class PassRecorder {
  readonly samples: VirtualUserRequestSample[] = [];
  rows = 0;

  constructor(private readonly signal: AbortSignal) {}

  async request<T>(
    label: string,
    run: () => PromiseLike<PostgrestResult>
  ): Promise<RequestOutcome<T>> {
    // A pass aborted mid-flight must not issue its remaining requests: those are
    // precisely the ones that would reach shared staging after the window.
    // No sample at all: a request the harness cancelled is not an observation of
    // the system. Recording it as a failure invents failures the target never
    // produced; with a 60s cadence over 600s the last tick commonly straddles the
    // boundary, which across the fleet is enough to push availability under its
    // target on a healthy run.
    if (this.signal.aborted) return FAILED;
    const startedAt = Date.now();
    try {
      const { data, count, error } = await run();
      const durationMs = Date.now() - startedAt;
      if (error) {
        // supabase-js converts a rejected fetch into an `error` result rather
        // than throwing, so the abort arrives here rather than in the catch.
        if (this.signal.aborted) return FAILED;
        this.samples.push({ table: label, durationMs, ok: false, status: 0 });
        return FAILED;
      }
      this.samples.push({ table: label, durationMs, ok: true, status: 200 });
      return { ok: true, rows: (data ?? []) as T[], count: count ?? null };
    } catch (error) {
      // Same reasoning for a request aborted mid-flight rather than before it began.
      if (this.signal.aborted || (error as { name?: string })?.name === 'AbortError') {
        return FAILED;
      }
      this.samples.push({ table: label, durationMs: Date.now() - startedAt, ok: false, status: 0 });
      return FAILED;
    }
  }
}
