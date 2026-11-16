/**
 * Pure helpers behind `answerLocally` (MYK9-2003). No Playwright, so each rule
 * is replayed against known answers in `readonly-walk-local.test.ts`.
 *
 * The rule: never imitate PostgREST. A refused PATCH, DELETE or upsert is
 * answered with the result of a real GET to the same table with the request's
 * own filters and `select`, so the database computes columns and embeds; the
 * request body is then laid over each returned row. Only an INSERT (or an
 * upsert that matches nothing) has no row to read, so its row is built from
 * the body, and each embed in its `select` is read with a GET by the foreign
 * key in the body. What cannot be read is a gap, and the walk report says so.
 *
 * No answer is ever exact: the database also runs triggers, defaults, generated
 * columns and casts that a laid-over body does not reproduce.
 *
 * Known limits: Content-Range carries a count only when one was asked for and
 * is not reproduced for a single-object request answered with return=minimal.
 */
export type Row = Record<string, unknown>;

/** How a locally answered write was produced. None is ever exact: see the file header. */
export type SimulationKind = 'overlaid on a real read' | 'built from the body' | 'read failed';

export type Simulated = {
  page: string;
  method: string;
  table: string;
  kind: SimulationKind;
  /** What could not be read or checked. Empty means none known, not exact. */
  gaps: string[];
  /** Status of the real read that failed, when `kind` is `read failed`. */
  status?: number;
};

export type SelectItem =
  | { kind: 'all' }
  | { kind: 'column'; name: string; column: string }
  | {
      kind: 'embed';
      name: string;
      table: string;
      hint: string | null;
      inner: string;
      /** `...table(cols)`: the columns are spread into the parent row. */
      spread: boolean;
      /** `table!inner(...)`: the parent row only exists when the embed does. */
      required: boolean;
    };

/** Split on commas that are not inside parentheses. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts.map(part => part.trim()).filter(Boolean);
}

/** The top-level items of a PostgREST `select`. No `select` means every column. */
export function parseSelect(select: string | null): SelectItem[] {
  if (!select) return [{ kind: 'all' }];
  return splitTopLevel(select).map((text): SelectItem => {
    if (text === '*') return { kind: 'all' };
    const spread = text.startsWith('...');
    const raw = spread ? text.slice(3) : text;
    const open = raw.indexOf('(');
    const head = open < 0 ? raw : raw.slice(0, open);
    const colon = head.indexOf(':');
    const aliased = colon >= 0 && head[colon + 1] !== ':';
    const alias = aliased ? head.slice(0, colon) : null;
    const target = (aliased ? head.slice(colon + 1) : head).split('::')[0] ?? '';
    if (open < 0) return { kind: 'column', name: alias ?? target, column: target };
    const [table = target, hint = null] = target.split('!');
    return {
      kind: 'embed',
      name: alias ?? table,
      table,
      hint: hint === 'inner' || hint === 'left' ? null : hint,
      inner: raw.slice(open + 1, raw.lastIndexOf(')')),
      spread,
      required: hint === 'inner',
    };
  });
}

/** Lay the request body over a row a real GET returned, for the columns the select returns. */
export function overlayBody(row: Row, body: Row, items: readonly SelectItem[]): Row {
  const next = { ...row };
  const wantsAll = items.some(item => item.kind === 'all');
  for (const [column, value] of Object.entries(body)) {
    const asked = items.find(item => item.kind === 'column' && item.column === column);
    if (asked?.kind === 'column') next[asked.name] = value;
    else if (wantsAll) next[column] = value;
  }
  return next;
}

const singular = (table: string): string =>
  table.endsWith('ies') ? `${table.slice(0, -3)}y` : table.replace(/s$/, '');

/** The body column that points at the embedded table, or `null` when none can be named. */
export function embedForeignKey(
  item: Extract<SelectItem, { kind: 'embed' }>,
  body: Row,
  sourceTable: string
): string | null {
  const keys = Object.keys(body).filter(key => key !== 'id');
  // A hint is a column name or a constraint name `<table>_<column>_fkey`, the
  // column with or without its `_id`. Matched whole, never as a substring.
  const hinted = keys.filter(
    key =>
      item.hint === key ||
      item.hint === `${sourceTable}_${key}_fkey` ||
      item.hint === `${sourceTable}_${key.replace(/_id$/, '')}_fkey`
  );
  const named = [
    ...hinted,
    `${item.name}_id`,
    `${singular(item.name)}_id`,
    `${singular(item.table)}_id`,
  ];
  return named.find(key => key !== 'id' && key in body) ?? null;
}

export type Embedded = { value: unknown; gap: string | null };

/** The query that reads one embedded row by the foreign key in the body. */
export const embedQuery = (inner: string, id: string): URLSearchParams =>
  new URLSearchParams({ select: inner || '*', id: `eq.${id}`, limit: '1' });

/**
 * Build the row an INSERT would return from its body. Columns the body does
 * not carry are `null` unless the select is `*`, which returns what is known.
 * Embeds are resolved by `readEmbed`; one it cannot read is left out and named.
 */
export async function synthesizeRow(
  body: Row,
  items: readonly SelectItem[],
  defaults: { id: string; now: string; table: string },
  readEmbed: (table: string, query: URLSearchParams) => Promise<Row[] | null>
): Promise<{ row: Row; gaps: string[] }> {
  const known: Row = {
    id: defaults.id,
    created_at: defaults.now,
    updated_at: defaults.now,
    ...body,
  };
  const row: Row = {};
  const gaps: string[] = [];
  for (const item of items) {
    if (item.kind === 'all') Object.assign(row, known);
    else if (item.kind === 'column') {
      row[item.name] = item.column in known ? known[item.column] : null;
      if (!(item.column in known)) gaps.push(`column ${item.column}`);
    } else if (item.spread) {
      gaps.push(`embed ${item.name} (spread)`);
    } else {
      const fk = embedForeignKey(item, known, defaults.table);
      const id = fk === null ? null : known[fk];
      if (fk === null) gaps.push(`embed ${item.name}`);
      else if (id === null || id === undefined) {
        row[item.name] = null;
        if (item.required) gaps.push(`embed ${item.name} (inner) is null`);
      } else {
        const found = await readEmbed(item.table, embedQuery(item.inner, String(id)));
        if (found && found.length === 1) row[item.name] = found[0];
        else {
          row[item.name] = null;
          gaps.push(`embed ${item.name}`);
        }
        if (item.required && row[item.name] === null && !gaps.includes(`embed ${item.name}`))
          gaps.push(`embed ${item.name} (inner) is null`);
      }
    }
  }
  return { row, gaps };
}

/**
 * After the body is laid over a real row, every embed is the OLD one unless it
 * is re-read. An embed joined through a column the body changed is re-read by
 * the new id. One that cannot be tied to a body column is `may be stale` when
 * the body changes anything.
 */
export async function refreshEmbeds(
  row: Row,
  body: Row,
  items: readonly SelectItem[],
  sourceTable: string,
  readEmbed: (table: string, query: URLSearchParams) => Promise<Row[] | null>
): Promise<{ row: Row; gaps: string[] }> {
  const next = { ...row };
  const gaps: string[] = [];
  const changes = Object.keys(body).length > 0;
  for (const item of items) {
    if (item.kind !== 'embed') continue;
    const fk = item.spread ? null : embedForeignKey(item, body, sourceTable);
    if (fk === null) {
      if (changes) gaps.push(`embed ${item.name} may be stale`);
      continue;
    }
    const id = body[fk];
    if (id === null || id === undefined) {
      next[item.name] = null;
      continue;
    }
    const found = await readEmbed(item.table, embedQuery(item.inner, String(id)));
    next[item.name] = found && found.length === 1 ? found[0] : null;
    if (!found || found.length !== 1) gaps.push(`embed ${item.name}`);
  }
  return { row: next, gaps };
}

/** The query that finds the rows an upsert of `row` would conflict with, or `null` if none can. */
export function conflictQuery(
  row: Row,
  columns: readonly string[],
  select: string | null
): URLSearchParams | null {
  const query = new URLSearchParams({ select: select ?? '*' });
  for (const column of columns.length ? columns : ['id']) {
    const value = row[column];
    if (value === null || value === undefined) return null;
    query.set(column, `eq.${String(value)}`);
  }
  return query;
}

/** Headers to replay a request as a plain read: the caller's auth, no body headers. */
export function readHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of ['apikey', 'authorization', 'accept-profile', 'x-client-info']) {
    const value = headers[name];
    if (value !== undefined) out[name] = value;
  }
  // A write names its schema in Content-Profile; the read of the same table names it in Accept-Profile.
  if (out['accept-profile'] === undefined && headers['content-profile'] !== undefined)
    out['accept-profile'] = headers['content-profile'];
  out.accept = 'application/json';
  return out;
}

export const resolutionOf = (
  prefer: string
): 'merge-duplicates' | 'ignore-duplicates' | undefined =>
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

/** One line of the report's Simulated list. */
export const describeSimulated = (entry: Simulated): string =>
  `${entry.page}  ${entry.method} ${entry.table}: ${entry.kind}` +
  (entry.status === undefined ? '' : ` (status ${entry.status})`) +
  (entry.gaps.length ? ` (gaps: ${entry.gaps.join(', ')})` : '');
