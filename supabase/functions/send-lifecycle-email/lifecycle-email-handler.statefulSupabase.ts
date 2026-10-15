import { vi } from 'vitest';

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

/**
 * An in-memory Supabase fake whose writes stick, so a test can run the same request
 * twice (a lost response, then a retry) and see what the first run left behind.
 * Unique violations (23505) are raised for a repeated `idempotency_key`.
 */
export function makeStatefulSupabase(
  initial: Record<string, Row[]>,
  rpcResults: Record<string, unknown> = {}
) {
  const tables: Record<string, Row[]> = Object.fromEntries(
    Object.entries(initial).map(([name, rows]) => [name, rows.map(row => ({ ...row }))])
  );
  let nextId = 0;
  /** Writes to fail once, in order: `{ table, mode }` matches the next such write. */
  const failures: Array<{ table: string; mode: 'insert' | 'update' }> = [];

  function from(table: string) {
    tables[table] ??= [];
    const filters: Filter[] = [];
    let mode: 'select' | 'insert' | 'update' = 'select';
    let payload: Row = {};
    const matching = () => tables[table].filter(row => filters.every(filter => filter(row)));

    const run = () => {
      const failAt = failures.findIndex(f => f.table === table && f.mode === mode);
      if (failAt >= 0) {
        failures.splice(failAt, 1);
        return { data: null, error: { message: 'injected failure' } };
      }
      if (mode === 'update') {
        const rows = matching();
        for (const row of rows) Object.assign(row, payload);
        return { data: rows, error: null };
      }
      if (mode === 'insert') {
        const key = payload.idempotency_key;
        if (key !== undefined && tables[table].some(row => row.idempotency_key === key)) {
          return { data: null, error: { code: '23505', message: 'duplicate key value' } };
        }
        nextId += 1;
        const row = { id: `${table}-${nextId}`, ...payload };
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

  return {
    tables,
    failNext: (table: string, mode: 'insert' | 'update') => failures.push({ table, mode }),
    supabase: {
      from: vi.fn(from),
      rpc: vi.fn(async (fn: string) => ({ data: rpcResults[fn] ?? null, error: null })),
    },
  };
}
