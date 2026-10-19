import { vi } from 'vitest';
import {
  claimRegistrationNumberNeededJob,
  finishRegistrationNumberNeededAttempt,
} from './lifecycle-email-handler.fakeClaim';

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

const JOBS = 'show_lifecycle_email_jobs';
const TIES = 'show_lifecycle_email_job_requests';
const FINISH = 'finish_registration_number_needed_attempt';

/**
 * An in-memory Supabase fake whose writes stick, so a test can run the same request
 * twice (a lost response, then a retry) and see what the first run left behind.
 * Unique violations (23505) are raised for a repeated `idempotency_key` and for a
 * second ready/failed registration_number_needed job for one entry: the two indexes
 * the jobs table carries. Request ties live in show_lifecycle_email_job_requests.
 *
 * `claim_registration_number_needed_job` runs the SQL function's decision table over
 * these same tables, atomically (an injected failure aborts it with no write), and
 * `finish_registration_number_needed_attempt` its compare-and-set on attempt_id
 * (`failNext(FINISH, 'rpc')` loses that write, as a dropped connection would).
 */
export function makeStatefulSupabase(
  initial: Record<string, Row[]>,
  rpcResults: Record<string, unknown> = {}
) {
  const tables: Record<string, Row[]> = Object.fromEntries(
    Object.entries(initial).map(([name, rows]) => [name, rows.map(row => ({ ...row }))])
  );
  // Seed convenience: a job row carrying `request_key` is split into the tie table.
  tables[TIES] ??= [];
  for (const job of tables[JOBS] ?? []) {
    if (job.request_key !== undefined) {
      tables[TIES].push({ show_id: job.show_id, request_key: job.request_key, job_id: job.id });
      delete job.request_key;
    }
  }
  let nextId = 0;
  const newId = (table: string) => `${table}-${(nextId += 1)}`;
  let nextAttempt = 0;
  const newAttemptId = () => `attempt-${(nextAttempt += 1)}`;
  /** Writes to fail once, in order: `{ table, mode }` matches the next such write. */
  const failures: Array<{ table: string; mode: 'insert' | 'update' | 'rpc' }> = [];
  const takeFailure = (table: string, mode: 'insert' | 'update' | 'rpc') => {
    const at = failures.findIndex(f => f.table === table && f.mode === mode);
    if (at < 0) return false;
    failures.splice(at, 1);
    return true;
  };

  const uniqueViolation = (table: string, candidate: Row, ignoreId?: unknown) => {
    if (table !== JOBS) return false;
    const others = tables[table].filter(row => row.id !== ignoreId);
    if (new Set(others.map(row => row.idempotency_key)).has(candidate.idempotency_key)) return true;
    const outstanding = (row: Row) => row.status === 'ready' || row.status === 'failed';
    return (
      candidate.step_type === 'registration_number_needed' &&
      outstanding(candidate) &&
      others.some(
        row =>
          row.step_type === 'registration_number_needed' &&
          row.entry_id === candidate.entry_id &&
          outstanding(row)
      )
    );
  };

  function from(table: string) {
    tables[table] ??= [];
    const filters: Filter[] = [];
    let mode: 'select' | 'insert' | 'update' = 'select';
    let payload: Row = {};
    const matching = () => tables[table].filter(row => filters.every(filter => filter(row)));

    const run = () => {
      if (mode !== 'select' && takeFailure(table, mode)) {
        return { data: null, error: { message: 'injected failure' } };
      }
      if (mode === 'update') {
        const rows = matching();
        for (const row of rows) Object.assign(row, payload);
        return { data: rows, error: null };
      }
      if (mode === 'insert') {
        if (uniqueViolation(table, payload)) {
          return { data: null, error: { code: '23505', message: 'duplicate key value' } };
        }
        const row = { id: newId(table), ...payload };
        tables[table].push(row);
        return { data: [row], error: null };
      }
      return { data: matching(), error: null };
    };

    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push(row => row[column] === value);
        return query;
      }),
      in: vi.fn((column: string, values: readonly unknown[]) => {
        filters.push(row => values.includes(row[column]));
        return query;
      }),
      // Only the role-validity filter uses `or`; every fixture role is valid.
      or: vi.fn(() => query),
      order: vi.fn(() => query),
      insert: vi.fn((value: Row) => {
        mode = 'insert';
        payload = value;
        return query;
      }),
      update: vi.fn((value: Row) => {
        mode = 'update';
        payload = value;
        return query;
      }),
      single: vi.fn(async () => {
        const { data, error } = run();
        return { data: data?.[0] ?? null, error };
      }),
      then: <TResult1 = unknown, TResult2 = never>(
        resolve?: ((value: ReturnType<typeof run>) => TResult1 | PromiseLike<TResult1>) | null,
        reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
      ): Promise<TResult1 | TResult2> => Promise.resolve(run()).then(resolve, reject),
    };
    return query;
  }

  const rpc = vi.fn(async (fn: string, args: Record<string, unknown> = {}) => {
    if (fn === 'claim_registration_number_needed_job') {
      if (takeFailure(JOBS, 'rpc')) return { data: null, error: { message: 'injected failure' } };
      return claimRegistrationNumberNeededJob(
        {
          jobs: tables[JOBS],
          ties: tables[TIES],
          newId: () => newId(JOBS),
          newAttemptId,
          uniqueViolation: row => uniqueViolation(JOBS, row),
        },
        args
      );
    }
    if (fn === FINISH) {
      if (takeFailure(FINISH, 'rpc')) return { data: null, error: { message: 'injected failure' } };
      return finishRegistrationNumberNeededAttempt(tables[JOBS], args);
    }
    return { data: rpcResults[fn] ?? null, error: null };
  });
  const rpcWithErrors = vi.fn(async (fn: string, args: Record<string, unknown> = {}) => {
    const canned = rpcResults[fn];
    if (canned && typeof canned === 'object' && 'error' in canned) {
      return { data: null, error: (canned as { error: unknown }).error };
    }
    // A canned answer for the claim stands in for the decision table (a garbled reply).
    if (fn === 'claim_registration_number_needed_job' && canned !== undefined) {
      return { data: canned, error: null };
    }
    return rpc(fn, args);
  });

  return {
    tables,
    failNext: (table: string, mode: 'insert' | 'update' | 'rpc') => failures.push({ table, mode }),
    supabase: { from: vi.fn(from), rpc: rpcWithErrors },
  };
}
