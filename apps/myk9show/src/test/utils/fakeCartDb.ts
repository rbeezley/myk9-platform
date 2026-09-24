/**
 * An in-memory stand-in for the PostgREST calls the cart store makes, with the
 * real column shapes of `entry_carts`, `entry_cart_items` and `classes`, and the
 * two unique indexes that decide cart behaviour:
 *
 *   entry_carts_active_show_exhibitor_unique_idx  (show_id, exhibitor_id) WHERE status = 'active'
 *   entry_cart_items_unique_dog_class_idx         (cart_id, dog_id, class_id)
 *
 * It evaluates filters, ORDER BY and LIMIT, so a test asserts on what a query
 * would actually return rather than on a scripted answer. `hold()` parks any
 * matching query until the test releases it, which is how the in-flight races
 * (MYK9-651, MYK9-655) are driven.
 *
 * Deliberately NOT a general PostgREST emulator: only the builder methods the
 * cart store calls are implemented, and an unknown one throws so a new call
 * shape fails loudly instead of silently matching everything.
 */

type Row = Record<string, unknown>;
type Op = 'select' | 'insert' | 'update' | 'delete';

export interface FakeCartRow {
  id: string;
  show_id: string;
  exhibitor_id: string;
  status: string | null;
  expires_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  subtotal_cents: number | null;
  platform_fee_cents: number | null;
  total_cents: number | null;
  stripe_checkout_session_id: string | null;
}

export interface FakeCartItemRow {
  id: string;
  cart_id: string;
  dog_id: string;
  class_id: string;
  handler_id: string | null;
  entry_fee_cents: number;
  jump_height: string | null;
  special_requests: string | null;
  entry_id: string | null;
  created_at: string | null;
}

/** `classes` columns the cart store reads (`classes_status_check` values). */
export interface FakeClassRow {
  id: string;
  name: string;
  level: string | null;
  trial_id: string;
  allow_waitlist: boolean | null;
  max_entries?: number | null;
  status: string | null;
}

export interface FakeQueryInfo {
  table: string;
  op: Op;
  columns: string | undefined;
  filters: string[];
  payload: unknown;
}

type QueryResult = { data: unknown; error: unknown };

interface Hold {
  match: (query: FakeQueryInfo) => boolean;
  release: () => void;
  gate: Promise<void>;
  used: boolean;
  /** Replaces the response the client receives (the server still ran). */
  respond: QueryResult | undefined;
}

export interface FakeCartDb {
  carts: FakeCartRow[];
  items: FakeCartItemRow[];
  classes: FakeClassRow[];
  /** `dogs` rows for the cart item embed: id, name, call_name. */
  dogs: Array<{ id: string; name: string; call_name: string | null }>;
  /** Entries rows the reconcile / class-start reads see. */
  entries: Row[];
  log: FakeQueryInfo[];
  from: (table: string) => FakeQuery;
  /**
   * Park the RESPONSE of the next query matching `match` until the returned
   * release runs. The query itself is evaluated when it is issued, as a real
   * server would, so a held read returns the rows as they were at that moment.
   * `respond` replaces what the client receives (e.g. a PostgREST error).
   */
  hold: (match: (query: FakeQueryInfo) => boolean, respond?: QueryResult) => () => void;
}

const uniqueViolation = (index: string) => ({
  code: '23505',
  message: `duplicate key value violates unique constraint "${index}"`,
  details: null,
});

const SHOW_EMBED = /show:shows\(/;
const COUNT_EMBED = /entry_cart_items\(count\)/;

class FakeQuery {
  private op: Op = 'select';
  private columns: string | undefined;
  private readonly predicates: Array<(row: Row) => boolean> = [];
  private readonly filterText: string[] = [];
  private payload: unknown;
  private orderBy: { column: string; ascending: boolean } | null = null;
  private limitTo: number | null = null;
  private mode: 'many' | 'single' | 'maybeSingle' = 'many';
  private returning = false;

  constructor(
    private readonly db: FakeCartDb,
    private readonly table: string,
    private readonly nextId: () => string
  ) {}

  select(columns?: string) {
    if (this.op === 'select') this.columns = columns;
    else this.returning = true;
    return this;
  }
  eq(column: string, value: unknown) {
    this.filterText.push(`${column}=${String(value)}`);
    this.predicates.push(row => row[column] === value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filterText.push(`${column} in ${values.join(',')}`);
    this.predicates.push(row => values.includes(row[column]));
    return this;
  }
  is(column: string, value: unknown) {
    this.filterText.push(`${column} is ${String(value)}`);
    this.predicates.push(row => (row[column] ?? null) === value);
    return this;
  }
  gt(column: string, value: string) {
    this.filterText.push(`${column}>${value}`);
    this.predicates.push(row => typeof row[column] === 'string' && (row[column] as string) > value);
    return this;
  }
  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending ?? true };
    return this;
  }
  limit(count: number) {
    this.limitTo = count;
    return this;
  }
  insert(payload: unknown) {
    this.op = 'insert';
    this.payload = payload;
    return this;
  }
  update(payload: unknown) {
    this.op = 'update';
    this.payload = payload;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  single() {
    this.mode = 'single';
    return this.run();
  }
  maybeSingle() {
    this.mode = 'maybeSingle';
    return this.run();
  }
  then<T>(resolve: (value: { data: unknown; error: unknown }) => T, reject?: (e: unknown) => T) {
    return this.run().then(resolve, reject);
  }

  private async run(): Promise<{ data: unknown; error: unknown }> {
    const info: FakeQueryInfo = {
      table: this.table,
      op: this.op,
      columns: this.columns,
      filters: this.filterText,
      payload: this.payload,
    };
    this.db.log.push(info);
    const result = this.execute();
    const hold = holds.get(this.db)?.find(h => !h.used && h.match(info));
    if (!hold) return result;
    hold.used = true;
    await hold.gate;
    return hold.respond ?? result;
  }

  private rows(): Row[] {
    switch (this.table) {
      case 'entry_carts':
        return this.db.carts as unknown as Row[];
      case 'entry_cart_items':
        return this.db.items as unknown as Row[];
      case 'classes':
        return this.db.classes as unknown as Row[];
      case 'entries':
        return this.db.entries;
      default:
        throw new Error(`fakeCartDb: no table ${this.table}`);
    }
  }

  private matching(): Row[] {
    return this.rows().filter(row => this.predicates.every(p => p(row)));
  }

  private activeCartConflict(): boolean {
    const active = this.db.carts.filter(c => c.status === 'active');
    const keys = active.map(c => `${c.show_id}:${c.exhibitor_id}`);
    return new Set(keys).size !== keys.length;
  }

  private project(row: Row): Row {
    const out: Row = { ...row };
    if (this.table === 'entry_carts' && this.columns && COUNT_EMBED.test(this.columns)) {
      out.entry_cart_items = [{ count: this.db.items.filter(i => i.cart_id === row.id).length }];
    }
    if (this.table === 'entry_carts' && this.columns && SHOW_EMBED.test(this.columns)) {
      out.show = {
        id: row.show_id,
        name: 'Show',
        start_date: '2026-10-10',
        entry_close_date: '2026-10-01',
      };
    }
    if (this.table === 'entry_cart_items') {
      out.class = this.db.classes.find(c => c.id === row.class_id);
      out.dog = this.db.dogs.find(d => d.id === row.dog_id);
    }
    return out;
  }

  private shape(rows: Row[]): { data: unknown; error: unknown } {
    if (this.mode === 'many') return { data: rows, error: null };
    if (rows.length === 0) {
      return this.mode === 'single'
        ? { data: null, error: { code: 'PGRST116', message: 'no rows' } }
        : { data: null, error: null };
    }
    return { data: rows[0], error: null };
  }

  private execute(): QueryResult {
    if (this.op === 'select') {
      let rows = this.matching();
      if (this.orderBy) {
        const { column, ascending } = this.orderBy;
        rows = [...rows].sort((a, b) => {
          const av = String(a[column] ?? '');
          const bv = String(b[column] ?? '');
          return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
        });
      }
      if (this.limitTo !== null) rows = rows.slice(0, this.limitTo);
      return this.shape(rows.map(row => this.project(row)));
    }

    if (this.op === 'insert') {
      const now = new Date().toISOString();
      const row: Row = { id: this.nextId(), created_at: now, ...(this.payload as Row) };
      if (this.table === 'entry_carts') {
        this.db.carts.push({
          updated_at: now,
          stripe_checkout_session_id: null,
          ...row,
        } as unknown as FakeCartRow);
        if (this.activeCartConflict()) {
          this.db.carts.pop();
          return {
            data: null,
            error: uniqueViolation('entry_carts_active_show_exhibitor_unique_idx'),
          };
        }
      } else if (this.table === 'entry_cart_items') {
        const dup = this.db.items.some(
          i => i.cart_id === row.cart_id && i.dog_id === row.dog_id && i.class_id === row.class_id
        );
        if (dup)
          return { data: null, error: uniqueViolation('entry_cart_items_unique_dog_class_idx') };
        this.db.items.push({
          entry_id: null,
          handler_id: null,
          ...row,
        } as unknown as FakeCartItemRow);
      } else {
        throw new Error(`fakeCartDb: insert into ${this.table} is not modelled`);
      }
      return this.shape(this.returning ? [this.project(row)] : []);
    }

    if (this.op === 'update') {
      const targets = this.matching();
      const before = targets.map(row => ({ ...row }));
      targets.forEach(row => Object.assign(row, this.payload as Row));
      if (this.table === 'entry_carts' && this.activeCartConflict()) {
        targets.forEach((row, index) => {
          for (const key of Object.keys(row)) delete row[key];
          Object.assign(row, before[index]);
        });
        return {
          data: null,
          error: uniqueViolation('entry_carts_active_show_exhibitor_unique_idx'),
        };
      }
      return this.shape(this.returning ? targets.map(row => this.project(row)) : []);
    }

    const doomed = new Set(this.matching());
    const rows = this.rows();
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (doomed.has(rows[i] as Row)) rows.splice(i, 1);
    }
    return { data: null, error: null };
  }
}

const holds = new WeakMap<FakeCartDb, Hold[]>();

export function createFakeCartDb(
  seed: {
    carts?: FakeCartRow[];
    items?: FakeCartItemRow[];
    classes?: FakeClassRow[];
    dogs?: Array<{ id: string; name: string; call_name: string | null }>;
    entries?: Row[];
  } = {}
): FakeCartDb {
  let counter = 0;
  const nextId = () => `generated-${(counter += 1)}`;
  const db: FakeCartDb = {
    carts: [...(seed.carts ?? [])],
    items: [...(seed.items ?? [])],
    classes: [...(seed.classes ?? [])],
    dogs: [...(seed.dogs ?? [])],
    entries: [...(seed.entries ?? [])],
    log: [],
    from: (table: string) => new FakeQuery(db, table, nextId),
    hold: (match, respond) => {
      let release = () => {};
      const gate = new Promise<void>(resolve => {
        release = resolve;
      });
      const entry: Hold = { match, release, gate, used: false, respond };
      holds.set(db, [...(holds.get(db) ?? []), entry]);
      return () => entry.release();
    },
  };
  holds.set(db, []);
  return db;
}

/** A cart row with every column set, defaulting to a live active cart. */
export function fakeCart(overrides: Partial<FakeCartRow> & Pick<FakeCartRow, 'id'>): FakeCartRow {
  return {
    show_id: 'show-1',
    exhibitor_id: 'exhibitor-1',
    status: 'active',
    expires_at: '2099-01-01T00:00:00.000Z',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    subtotal_cents: 0,
    platform_fee_cents: 0,
    total_cents: 0,
    stripe_checkout_session_id: null,
    ...overrides,
  };
}

/** A cart item row with every column set. */
export function fakeCartItem(
  overrides: Partial<FakeCartItemRow> & Pick<FakeCartItemRow, 'id' | 'cart_id'>
): FakeCartItemRow {
  return {
    dog_id: 'dog-1',
    class_id: 'class-1',
    handler_id: null,
    entry_fee_cents: 3000,
    jump_height: null,
    special_requests: null,
    entry_id: null,
    created_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}
