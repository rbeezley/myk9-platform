/**
 * MYK9-2252: an in-memory stand-in for one PostgREST table, faithful to the parts
 * paging depends on: the `max_rows` cap on every response, `.range()`, `.order()`
 * on one or two columns, `.gt()`, `.eq()`, `.is()` and the `.or()` keyset filter
 * `updated_at.gt.X,and(updated_at.eq.X,id.gt.Y)` the pager sends. A query that is
 * not paged gets only the first `maxRows` rows, as it does against the real server.
 */
type Row = Record<string, unknown>;

interface FakeResult {
  data: Row[];
  error: null;
}

export interface FakePostgrestTable {
  /** Every request that reached the server: its filters, ordering and range. */
  requests: string[];
  from: () => FakeBuilder;
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T/;

// Timestamps compare as instants (the server may return a different offset
// spelling of one instant); every other string compares as text. Date.parse is
// not a safe test for "is a date": V8 reads strings like 'id-00999' as dates.
const comparable = (value: unknown): unknown =>
  typeof value === 'string' && ISO_TIMESTAMP.test(value) ? Date.parse(value) : value;

const compare = (a: unknown, b: unknown): number => {
  const left = comparable(a);
  const right = comparable(b);
  if (left === right) return 0;
  return (left as number | string) < (right as number | string) ? -1 : 1;
};

class FakeBuilder implements PromiseLike<FakeResult> {
  private filters: Array<(row: Row) => boolean> = [];
  private orderBy: string[] = [];
  private window: [number, number] | null = null;
  private described: string[] = [];

  constructor(
    private readonly rows: Row[],
    private readonly maxRows: number,
    private readonly requests: string[]
  ) {}

  select(): this {
    return this;
  }
  eq(column: string, value: unknown): this {
    this.described.push(`eq ${column}`);
    this.filters.push(row => row[column] === value);
    return this;
  }
  is(column: string, value: null): this {
    this.described.push(`is ${column}`);
    this.filters.push(row => (row[column] ?? null) === value);
    return this;
  }
  gt(column: string, value: string): this {
    this.described.push(`gt ${column}`);
    this.filters.push(row => compare(row[column], value) > 0);
    return this;
  }
  or(expression: string): this {
    const match = /^updated_at\.gt\.(.+?),and\(updated_at\.eq\.(.+?),id\.gt\.(.+)\)$/.exec(
      expression
    );
    if (!match) throw new Error(`fake PostgREST: unsupported or() ${expression}`);
    const [, after, same, id] = match;
    this.described.push('or keyset');
    this.filters.push(
      row =>
        compare(row.updated_at, after) > 0 ||
        (compare(row.updated_at, same) === 0 && compare(row.id, id) > 0)
    );
    return this;
  }
  order(column: string): this {
    this.orderBy.push(column);
    return this;
  }
  range(from: number, to: number): this {
    this.window = [from, to];
    return this;
  }
  limit(count: number): this {
    this.window = [0, count - 1];
    return this;
  }
  abortSignal(): this {
    return this;
  }

  private run(): FakeResult {
    const matching = this.rows
      .filter(row => this.filters.every(keep => keep(row)))
      .sort((a, b) => {
        for (const column of this.orderBy) {
          const diff = compare(a[column], b[column]);
          if (diff !== 0) return diff;
        }
        return 0;
      });
    const [from, to] = this.window ?? [0, Number.POSITIVE_INFINITY];
    const data = matching.slice(from, Math.min(to + 1, from + this.maxRows));
    this.requests.push(
      `${this.described.join(' ')} order(${this.orderBy.join(',')}) -> ${data.length}`
    );
    return { data, error: null };
  }

  then<R1 = FakeResult, R2 = never>(
    onfulfilled?: ((value: FakeResult) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return Promise.resolve()
      .then(() => this.run())
      .then(onfulfilled, onrejected);
  }
}

export function createFakePostgrestTable(rows: Row[], maxRows = 1000): FakePostgrestTable {
  const requests: string[] = [];
  return { requests, from: () => new FakeBuilder(rows, maxRows, requests) };
}
