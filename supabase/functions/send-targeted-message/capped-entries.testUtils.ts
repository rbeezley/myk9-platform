import { vi } from 'vitest';

// MYK9-1692: the entries read used to be one request, and PostgREST caps every
// response at max_rows (supabase/config.toml: 1000). This fixture evaluates the
// filters the handler actually applies against an in-memory table and enforces
// that cap, so an audience past row 1000 is only complete if the handler pages.

export type SettledResult = { data: unknown; error: unknown };
export type Person = {
  id: string;
  auth_user_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
};
export type EntryRow = {
  id: string;
  show_id: string;
  class_id: string;
  deleted_at: string | null;
  check_in_status: string;
  dog_id: string;
  handler_id: string;
  armband: string;
  dog: { owner: Person | null; co_owner: Person | null };
  handler: Person | null;
};

export const person = (
  id: string,
  email: string | null,
  authUserId: string | null = null
): Person => ({
  id,
  auth_user_id: authUserId,
  first_name: id,
  last_name: 'Smith',
  email,
});

export const pad = (n: number) => String(n).padStart(5, '0');

/** One entry per key, owned and handled by its own person; `overrides` changes either. */
export function entry(i: number | string, overrides: Partial<EntryRow> = {}): EntryRow {
  const key = typeof i === 'number' ? pad(i) : i;
  const owner = person(`p-${key}`, `o-${key}@example.com`);
  return {
    id: `e-${key}`,
    show_id: 'show-1',
    class_id: 'class-1',
    deleted_at: null,
    check_in_status: 'checked-in',
    dog_id: `dog-${key}`,
    handler_id: owner.id,
    armband: `A${key}`,
    dog: { owner, co_owner: null },
    handler: owner,
    ...overrides,
  };
}

type Predicate = (row: EntryRow) => boolean;

function parseOrFilter(filter: string): Predicate {
  const clauses = filter.match(/[a-z_]+\.(?:eq\.[^,]+|in\.\([^)]*\))/g) ?? [];
  const tests = clauses.map(clause => {
    const [column, op, ...rest] = clause.split('.');
    const value = rest.join('.');
    const key = column as keyof EntryRow;
    if (op === 'eq') return (row: EntryRow) => row[key] === value;
    const values = value.replace(/^\(|\)$/g, '').split(',');
    return (row: EntryRow) => values.includes(String(row[key]));
  });
  return row => tests.some(test => test(row));
}

/** A PostgREST-shaped entries query that honors the handler's filters and the row cap. */
export function cappedEntriesTable(
  rows: EntryRow[],
  opts: { maxRows?: number; failOnRequest?: number } = {}
) {
  const maxRows = opts.maxRows ?? 1000;
  const requests: Array<{ order: string | null; returned: number }> = [];
  const orFilters: string[] = [];

  function query() {
    const predicates: Predicate[] = [];
    let order: { column: keyof EntryRow; ascending: boolean } | null = null;
    let limit = Infinity;

    const run = (): SettledResult => {
      const requestNumber = requests.length + 1;
      let result = rows.filter(row => predicates.every(predicate => predicate(row)));
      if (order) {
        const { column, ascending } = order;
        result = [...result].sort((a, b) => {
          const cmp =
            String(a[column]) < String(b[column])
              ? -1
              : String(a[column]) > String(b[column])
                ? 1
                : 0;
          return ascending ? cmp : -cmp;
        });
      }
      result = result.slice(0, Math.min(limit, maxRows));
      requests.push({ order: order ? String(order.column) : null, returned: result.length });
      if (requestNumber === opts.failOnRequest) {
        return { data: null, error: { message: 'canceling statement due to statement timeout' } };
      }
      return { data: result, error: null };
    };

    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        predicates.push(row => row[column as keyof EntryRow] === value);
        return builder;
      }),
      is: vi.fn((column: string, value: unknown) => {
        predicates.push(row => row[column as keyof EntryRow] === value);
        return builder;
      }),
      in: vi.fn((column: string, values: readonly unknown[]) => {
        predicates.push(row => values.includes(row[column as keyof EntryRow]));
        return builder;
      }),
      or: vi.fn((filter: string) => {
        orFilters.push(filter);
        predicates.push(parseOrFilter(filter));
        return builder;
      }),
      gt: vi.fn((column: string, value: unknown) => {
        predicates.push(row => String(row[column as keyof EntryRow]) > String(value));
        return builder;
      }),
      order: vi.fn((column: string, options?: { ascending?: boolean }) => {
        order = { column: column as keyof EntryRow, ascending: options?.ascending ?? true };
        return builder;
      }),
      limit: vi.fn((count: number) => {
        limit = count;
        return builder;
      }),
      upsert: vi.fn(() => builder),
      insert: vi.fn(() => builder),
      single: vi.fn(async () => run()),
      then: <TResult1 = SettledResult, TResult2 = never>(
        resolve?: ((value: SettledResult) => TResult1 | PromiseLike<TResult1>) | null,
        reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
      ): Promise<TResult1 | TResult2> => Promise.resolve().then(run).then(resolve, reject),
    };
    return builder;
  }

  return { query, requests, orFilters };
}

export function simpleChain(result: { data?: unknown; error?: unknown }) {
  const settled: SettledResult = { data: result.data ?? null, error: result.error ?? null };
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    or: vi.fn(() => builder),
    in: vi.fn(() => builder),
    gt: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    upsert: vi.fn((_rows: unknown) => builder),
    insert: vi.fn((_rows: unknown) => builder),
    single: vi.fn(async () => settled),
    then: <TResult1 = SettledResult, TResult2 = never>(
      resolve?: ((value: SettledResult) => TResult1 | PromiseLike<TResult1>) | null,
      reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ): Promise<TResult1 | TResult2> => Promise.resolve(settled).then(resolve, reject),
  };
  return builder;
}
