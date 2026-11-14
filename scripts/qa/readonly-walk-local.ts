/**
 * The in-browser table store behind `answerLocally` in `readonly-walk.ts`
 * (MYK9-1980). Pure: no Playwright, so each rule is replayed against known
 * answers in `readonly-walk-local.test.ts`.
 *
 * It reproduces the parts of PostgREST a draft save leans on: horizontal
 * filters, upsert, and the row count. A filter it cannot evaluate (`or`,
 * `not.`, `like`, a JSON path) is reported as unreadable, never guessed: the
 * caller refuses the write instead of answering it wrongly.
 */
export type Row = Record<string, unknown>;

export type Filter = { column: string; test: (value: unknown) => boolean };

/** Query keys PostgREST reads as options, not as column filters. */
const OPTION_KEYS = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);

const COMPARE: Record<string, (order: number) => boolean> = {
  gt: order => order > 0,
  gte: order => order >= 0,
  lt: order => order < 0,
  lte: order => order <= 0,
};

const numeric = (value: string): boolean => value.trim() !== '' && Number.isFinite(Number(value));

/** Order a stored value against a filter operand: as numbers, then as timestamps, then as text. */
function order(value: unknown, operand: string): number {
  const stored = String(value);
  if (numeric(stored) && numeric(operand)) return Number(stored) - Number(operand);
  const [a, b] = [Date.parse(stored), Date.parse(operand)];
  if (!Number.isNaN(a) && !Number.isNaN(b)) return a - b;
  return stored < operand ? -1 : stored > operand ? 1 : 0;
}

const unquote = (value: string): string =>
  value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;

const text = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);

function parseFilter(column: string, raw: string): Filter | null {
  const dot = raw.indexOf('.');
  if (dot < 0 || column.includes('->')) return null;
  const op = raw.slice(0, dot);
  const operand = raw.slice(dot + 1);
  if (op === 'eq') return { column, test: v => text(v) === operand };
  if (op === 'neq')
    return {
      column,
      test: v => {
        const value = text(v);
        return value !== null && value !== operand;
      },
    };
  if (op === 'in') {
    if (!operand.startsWith('(') || !operand.endsWith(')')) return null;
    const set = new Set(operand.slice(1, -1).split(',').map(unquote));
    return {
      column,
      test: v => {
        const value = text(v);
        return value !== null && set.has(value);
      },
    };
  }
  if (op === 'is') {
    if (operand === 'null') return { column, test: v => v === null || v === undefined };
    if (operand === 'true') return { column, test: v => v === true };
    if (operand === 'false') return { column, test: v => v === false };
    return null;
  }
  const compare = COMPARE[op];
  if (compare) {
    return {
      column,
      test: v => v !== null && v !== undefined && compare(order(v, operand)),
    };
  }
  return null;
}

/** The column filters of a PostgREST query, or `null` when one cannot be evaluated here. */
export function parseFilters(search: URLSearchParams): Filter[] | null {
  const filters: Filter[] = [];
  for (const [key, raw] of search) {
    if (OPTION_KEYS.has(key)) continue;
    if (key === 'or' || key === 'and') return null;
    const filter = parseFilter(key, raw);
    if (!filter) return null;
    filters.push(filter);
  }
  return filters;
}

export const matches = (row: Row, filters: readonly Filter[]): boolean =>
  filters.every(filter => filter.test(row[filter.column]));

/** Rows the walk wrote, by id, and ids it deleted. Real rows stay in the database. */
export type TableState = { rows: Map<string, Row>; deleted: Set<string> };

export const emptyTable = (): TableState => ({ rows: new Map(), deleted: new Set() });

const keyOf = (row: Row): string => text(row.id) ?? JSON.stringify(row);

export const isTouched = (state: TableState): boolean =>
  state.rows.size > 0 || state.deleted.size > 0;

/**
 * What the table looks like to the walk: the real rows a query returned, with
 * deleted ones dropped and edited ones replaced, plus local rows that match.
 */
export function overlay(
  real: readonly Row[],
  state: TableState,
  filters: readonly Filter[]
): Row[] {
  const out: Row[] = [];
  const seen = new Set<string>();
  for (const row of real) {
    const key = keyOf(row);
    seen.add(key);
    if (state.deleted.has(key)) continue;
    const local = state.rows.get(key);
    if (!local) out.push(row);
    else if (matches(local, filters)) out.push(local);
  }
  for (const [key, row] of state.rows) {
    if (!seen.has(key) && matches(row, filters)) out.push(row);
  }
  return out;
}

export type InsertOptions = {
  /** From `Prefer: resolution=…`; absent for a plain insert. */
  resolution?: 'merge-duplicates' | 'ignore-duplicates';
  /** From `on_conflict=`; PostgREST defaults to the primary key. */
  onConflict?: readonly string[];
  makeId: () => string;
  now: string;
  /** Database rows that may conflict, so an upsert merges into them and does not copy them. */
  real?: readonly Row[];
};

/** Insert or upsert. Returns the rows PostgREST would return. */
export function applyInsert(
  state: TableState,
  incoming: readonly Row[],
  options: InsertOptions
): Row[] {
  const conflict = options.onConflict?.length ? options.onConflict : ['id'];
  const out: Row[] = [];
  for (const row of incoming) {
    const existing = options.resolution
      ? overlay(options.real ?? [], state, []).find(candidate =>
          conflict.every(
            column => row[column] !== undefined && text(candidate[column]) === text(row[column])
          )
        )
      : undefined;
    if (existing && options.resolution === 'ignore-duplicates') continue;
    const next: Row = existing
      ? { ...existing, ...row, updated_at: options.now }
      : { id: options.makeId(), created_at: options.now, updated_at: options.now, ...row };
    const key = keyOf(next);
    state.rows.set(key, next);
    state.deleted.delete(key);
    out.push(next);
  }
  return out;
}

/** The query that finds a database row an upsert of `row` would conflict with, or `null` if none can. */
export function conflictQuery(row: Row, columns: readonly string[]): URLSearchParams | null {
  const query = new URLSearchParams({ select: '*' });
  for (const column of columns.length ? columns : ['id']) {
    const value = text(row[column]);
    if (value === null) return null;
    query.set(column, `eq.${value}`);
  }
  return query;
}

export function applyPatch(
  state: TableState,
  targets: readonly Row[],
  patch: Row,
  now: string
): Row[] {
  return targets.map(row => {
    const next = { ...row, ...patch, updated_at: now };
    state.rows.set(keyOf(next), next);
    return next;
  });
}

export function applyDelete(state: TableState, targets: readonly Row[]): Row[] {
  for (const row of targets) {
    const key = keyOf(row);
    state.rows.delete(key);
    state.deleted.add(key);
  }
  return [...targets];
}

/** Headers to replay a request as a plain read: the caller's auth, no body headers. */
export function readHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of ['apikey', 'authorization', 'accept-profile', 'x-client-info']) {
    const value = headers[name];
    if (value !== undefined) out[name] = value;
  }
  out.accept = 'application/json';
  return out;
}

export const resolutionOf = (prefer: string): InsertOptions['resolution'] =>
  prefer.includes('resolution=merge-duplicates')
    ? 'merge-duplicates'
    : prefer.includes('resolution=ignore-duplicates')
      ? 'ignore-duplicates'
      : undefined;

/** `Content-Range` as PostgREST sends it; the total only when a count was asked for. */
export function contentRange(count: number, counted: boolean): string {
  const range = count === 0 ? '*' : `0-${count - 1}`;
  return `${range}/${counted ? count : '*'}`;
}

/** PostgREST's answer to `.single()` when the result is not exactly one row. */
export const singleRowError = (count: number) => ({
  code: 'PGRST116',
  details: `The result contains ${count} rows`,
  hint: null,
  message: 'JSON object requested, multiple (or no) rows returned',
});
