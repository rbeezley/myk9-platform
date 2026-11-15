// Pure model for the single-show restore plan (MYK9-110, drill 4). No I/O: the CLI feeds it the
// schema-only and data-only text of a decrypted export (`pg_restore -f -`), so everything here is
// unit-testable with fixtures.
import {
  isMoneyTable,
  unclassifiedMessage,
  unclassifiedTables,
} from './single-show-restore-tables';

export interface ForeignKey {
  table: string; // schema.table
  name: string;
  column: string;
  refTable: string; // schema.table
  refColumn: string;
  cascade: boolean; // ON DELETE CASCADE
}

export interface TableData {
  columns: string[];
  rows: (string | null)[][];
}

export interface TableSummary {
  table: string;
  rows: number;
}

export interface ExternalRef {
  table: string;
  column: string;
  refTable: string;
  refColumn: string;
  values: string[];
}

export interface RestorePlan {
  showId: string;
  tables: TableSummary[];
  totalRows: number;
  externalRefs: ExternalRef[];
  warnings: string[];
  sql: string;
}

export const SHOWS_TABLE = 'public.shows';
const INSERT_BATCH = 200;

const unquote = (id: string): string => id.replace(/"/g, '');

export function parseForeignKeys(schemaSql: string): ForeignKey[] {
  const pattern =
    /ALTER TABLE (?:ONLY )?(\S+)\s+ADD CONSTRAINT (\S+) FOREIGN KEY \(([^)]+)\) REFERENCES ([^\s(]+)\(([^)]+)\)([^;]*);/g;
  const keys: ForeignKey[] = [];
  for (const match of schemaSql.matchAll(pattern)) {
    const [, table, name, column, refTable, refColumn, tail] = match;
    if (column.includes(',') || refColumn.includes(',')) continue; // composite keys are out of scope
    keys.push({
      table: unquote(table),
      name: unquote(name),
      column: unquote(column).trim(),
      refTable: unquote(refTable),
      refColumn: unquote(refColumn).trim(),
      cascade: /ON DELETE CASCADE/.test(tail),
    });
  }
  return keys;
}

const ESCAPES: Record<string, string> = { b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v' };

export function decodeCopyField(field: string): string | null {
  if (field === '\\N') return null;
  return field.replace(/\\(x[0-9a-fA-F]{1,2}|[0-7]{1,3}|.)/gs, (_all, code: string) => {
    if (code.length > 1 && code[0] === 'x') return String.fromCharCode(parseInt(code.slice(1), 16));
    if (/^[0-7]+$/.test(code)) return String.fromCharCode(parseInt(code, 8));
    return ESCAPES[code] ?? code;
  });
}

/** Parses `COPY schema.table (cols) FROM stdin;` blocks, keeping only the wanted tables. */
export function parseCopyData(dataSql: string, wanted: Set<string>): Map<string, TableData> {
  const result = new Map<string, TableData>();
  let current: TableData | null = null;
  for (const line of dataSql.split('\n')) {
    if (current) {
      if (line === '\\.') current = null;
      else current.rows.push(line.split('\t').map(decodeCopyField));
      continue;
    }
    const header = /^COPY (\S+) \(([^)]*)\) FROM stdin;$/.exec(line);
    if (!header) continue;
    const table = unquote(header[1]);
    if (!wanted.has(table)) continue;
    current = { columns: header[2].split(',').map(c => unquote(c).trim()), rows: [] };
    result.set(table, current);
  }
  return result;
}

/** Tables a delete of one show cascades into, transitively, starting at `public.shows`. */
export function cascadeClosure(keys: ForeignKey[]): Set<string> {
  const closure = new Set<string>([SHOWS_TABLE]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const key of keys) {
      if (key.cascade && closure.has(key.refTable) && !closure.has(key.table)) {
        closure.add(key.table);
        grew = true;
      }
    }
  }
  return closure;
}

export interface Selection {
  included: Map<string, Set<number>>;
  data: Map<string, TableData>;
}

/**
 * A row belongs to the show when ANY of its cascade foreign keys points at an included parent
 * row. Following every route (show_id, class to trial, trial_id) is deliberate: a nullable
 * denormalized show_id alone silently drops rows (go-live-runbook § 2.4.1).
 */
export function selectShowRows(
  showId: string,
  keys: ForeignKey[],
  data: Map<string, TableData>
): Selection {
  const closure = cascadeClosure(keys);
  const included = new Map<string, Set<number>>();
  for (const table of closure) included.set(table, new Set());
  const shows = data.get(SHOWS_TABLE);
  const idCol = shows?.columns.indexOf('id') ?? -1;
  if (!shows || idCol < 0) throw new Error(`${SHOWS_TABLE} has no data in this export`);
  shows.rows.forEach((row, index) => {
    if (row[idCol] === showId) included.get(SHOWS_TABLE)?.add(index);
  });
  if (included.get(SHOWS_TABLE)?.size !== 1) {
    throw new Error(`show ${showId} was not found in this export`);
  }
  const cascadeKeys = keys.filter(
    k => k.cascade && closure.has(k.table) && closure.has(k.refTable) && k.table !== k.refTable
  );
  const selfKeys = keys.filter(k => k.cascade && k.table === k.refTable && closure.has(k.table));
  let grew = true;
  while (grew) {
    grew = false;
    for (const key of [...cascadeKeys, ...selfKeys]) {
      const child = data.get(key.table);
      const parent = data.get(key.refTable);
      if (!child || !parent) continue;
      const childCol = child.columns.indexOf(key.column);
      const parentCol = parent.columns.indexOf(key.refColumn);
      if (childCol < 0 || parentCol < 0) continue;
      const parentValues = new Set<string>();
      for (const index of included.get(key.refTable) ?? []) {
        const value = parent.rows[index][parentCol];
        if (value !== null) parentValues.add(value);
      }
      const set = included.get(key.table) as Set<number>;
      child.rows.forEach((row, index) => {
        const value = row[childCol];
        if (!set.has(index) && value !== null && parentValues.has(value)) {
          set.add(index);
          grew = true;
        }
      });
    }
  }
  return { included, data };
}

export function orderTables(tables: string[], keys: ForeignKey[]): string[] {
  const remaining = new Set(tables);
  const ordered: string[] = [];
  while (remaining.size) {
    const ready = [...remaining]
      .filter(t => keys.every(k => k.table !== t || k.refTable === t || !remaining.has(k.refTable)))
      .sort();
    // A foreign-key cycle cannot be ordered; replica mode makes the order irrelevant.
    const next = ready.length ? ready : [[...remaining].sort()[0]];
    for (const t of next) {
      ordered.push(t);
      remaining.delete(t);
    }
  }
  return ordered;
}

export const quoteIdent = (id: string): string => `"${id.replace(/"/g, '""')}"`;
export const quoteTable = (table: string): string => table.split('.').map(quoteIdent).join('.');
export const quoteLiteral = (value: string | null): string =>
  value === null ? 'NULL' : `'${value.replace(/'/g, "''")}'`;

function externalRefs(selection: Selection, keys: ForeignKey[]): ExternalRef[] {
  const refs: ExternalRef[] = [];
  for (const key of keys) {
    const rows = selection.included.get(key.table);
    const data = selection.data.get(key.table);
    if (!rows || !data || selection.included.has(key.refTable)) continue;
    const col = data.columns.indexOf(key.column);
    if (col < 0) continue;
    const values = new Set<string>();
    for (const index of rows) {
      const value = data.rows[index][col];
      if (value !== null) values.add(value);
    }
    if (values.size) refs.push({ ...key, values: [...values].sort() });
  }
  return refs.sort((a, b) => `${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`));
}

function preflightSql(ref: ExternalRef): string {
  const list = ref.values.map(v => `(${quoteLiteral(v)})`).join(', ');
  const label = `${ref.table}.${ref.column} -> ${ref.refTable}.${ref.refColumn}`;
  return [
    'DO $preflight$ DECLARE missing integer; BEGIN',
    `  SELECT count(*) INTO missing FROM (VALUES ${list}) v(id)`,
    `    WHERE NOT EXISTS (SELECT 1 FROM ${quoteTable(ref.refTable)} p WHERE p.${quoteIdent(ref.refColumn)}::text = v.id);`,
    `  IF missing > 0 THEN RAISE EXCEPTION '% referenced rows missing for ${label.replace(/'/g, "''")}', missing; END IF;`,
    'END $preflight$;',
  ].join('\n');
}

export interface PlanOptions {
  showId: string;
  sourceRef: string;
  exportCreatedAt: string;
  excludeTables?: string[];
  includeMoney?: boolean;
  showDataTables?: ReadonlySet<string>; // tests only; defaults to SHOW_DATA_TABLES
}

export function buildPlan(
  selection: Selection,
  keys: ForeignKey[],
  options: PlanOptions
): RestorePlan {
  const exclude = new Set(options.excludeTables ?? []);
  const unclassified = unclassifiedTables(
    selection.included.keys(),
    exclude,
    options.showDataTables
  );
  if (unclassified.length) throw new Error(unclassifiedMessage(unclassified));
  const warnings: string[] = [];
  for (const table of exclude) {
    if (!selection.included.has(table))
      warnings.push(`--exclude-table ${table} is not in the closure`);
  }
  for (const [table, rows] of selection.included) {
    if (!selection.data.has(table) && rows.size === 0 && !exclude.has(table)) {
      warnings.push(`${table}: no data section in the export (table empty or not in this archive)`);
    }
  }
  const money = [...selection.included]
    .filter(([t, rows]) => rows.size && isMoneyTable(t) && !exclude.has(t))
    .map(([t]) => t);
  if (options.includeMoney) {
    if (money.length) {
      warnings.push(
        `--include-money: money tables included (${money.join(', ')}). Stripe is the record for money and restoring old rows can double-count; reconcile against Stripe after the restore`
      );
    }
  } else {
    for (const t of money) exclude.add(t);
    if (money.length) {
      warnings.push(
        `money tables excluded by default (${money.join(', ')}); pass --include-money to restore them`
      );
    }
  }
  const tables = orderTables(
    [...selection.included.keys()].filter(t => !exclude.has(t)),
    keys
  );
  const summaries: TableSummary[] = [];
  const statements: string[] = [];
  for (const table of tables) {
    const data = selection.data.get(table);
    const indexes = [...(selection.included.get(table) ?? [])].sort((a, b) => a - b);
    summaries.push({ table, rows: indexes.length });
    if (!data || !indexes.length) continue;
    const columns = data.columns.map(quoteIdent).join(', ');
    for (let i = 0; i < indexes.length; i += INSERT_BATCH) {
      const values = indexes
        .slice(i, i + INSERT_BATCH)
        .map(idx => `(${data.rows[idx].map(quoteLiteral).join(', ')})`)
        .join(',\n  ');
      statements.push(
        `INSERT INTO ${quoteTable(table)} (${columns}) VALUES\n  ${values}\nON CONFLICT DO NOTHING;`
      );
    }
  }
  const refs = externalRefs(
    { ...selection, included: new Map([...selection.included].filter(([t]) => !exclude.has(t))) },
    keys
  );
  const totalRows = summaries.reduce((sum, s) => sum + s.rows, 0);
  const sql = [
    `-- myK9 single-show restore plan. show ${options.showId}`,
    `-- source project ${options.sourceRef}, export created ${options.exportCreatedAt}`,
    `-- ${totalRows} rows across ${summaries.filter(s => s.rows).length} tables. Contains data: keep private.`,
    'BEGIN;',
    'SET LOCAL session_replication_role = replica;',
    'SET LOCAL standard_conforming_strings = on;',
    ...refs.map(preflightSql),
    ...statements,
    'COMMIT;',
    '',
  ].join('\n');
  return {
    showId: options.showId,
    tables: summaries,
    totalRows,
    externalRefs: refs,
    warnings,
    sql,
  };
}

export function formatSummary(plan: RestorePlan): string {
  const lines = [`Plan for show ${plan.showId}: ${plan.totalRows} rows`];
  for (const t of plan.tables.filter(s => s.rows))
    lines.push(`  ${String(t.rows).padStart(7)}  ${t.table}`);
  const empty = plan.tables.filter(s => !s.rows).map(s => s.table);
  if (empty.length) lines.push(`  (no rows: ${empty.join(', ')})`);
  lines.push('Rows that must already exist in the target (checked before any insert):');
  for (const r of plan.externalRefs) {
    lines.push(
      `  ${String(r.values.length).padStart(7)}  ${r.refTable}.${r.refColumn}  <- ${r.table}.${r.column}`
    );
  }
  for (const w of plan.warnings) lines.push(`WARNING: ${w}`);
  return lines.join('\n');
}
