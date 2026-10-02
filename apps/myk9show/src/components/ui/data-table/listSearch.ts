/**
 * ONE list search, read from the column definitions (MYK9-929).
 *
 * A row matches when the query appears in any searchable column's value: the column's accessor
 * value, plus the text it DISPLAYS when that differs (`meta.searchValue`: "Not started" for a
 * stored "Scheduled", "MAY 10" for "2026-05-10"). DataTable's built-in search and every list that
 * moved its search into a page-level `ListFilterBar` call this with the same columns the table
 * renders, so what a secretary can type always finds what she can see, and an export of "the rows
 * on screen" is `filterByListSearch` of the same rows.
 */

import type { ColumnDef } from '@tanstack/react-table';
import type { DataTableColumnMeta } from './types';

type Searchable = string | number;

function readPath(row: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (value == null || typeof value !== 'object') return undefined;
    return (value as Record<string, unknown>)[key];
  }, row);
}

function asSearchable(value: unknown): Searchable | null {
  return typeof value === 'string' || typeof value === 'number' ? value : null;
}

/** Every string a column makes findable for this row. Columns with no value (actions) add none. */
export function searchableValues<TData>(
  row: TData,
  columns: ReadonlyArray<ColumnDef<TData, unknown>>
): string[] {
  const values: string[] = [];
  columns.forEach((column, index) => {
    const def = column as ColumnDef<TData, unknown> & {
      accessorKey?: string;
      accessorFn?: (row: TData, index: number) => unknown;
    };
    const accessed =
      typeof def.accessorFn === 'function'
        ? def.accessorFn(row, index)
        : typeof def.accessorKey === 'string'
          ? readPath(row, def.accessorKey)
          : undefined;
    const meta = column.meta as DataTableColumnMeta | undefined;
    // Both what the column SHOWS ("Not started", "MAY 10") and its stored value ("Scheduled",
    // "2026-05-10") are findable. Words start at a space or any punctuation, so "2026-05-10" and
    // "05" both find the stored date, and a short word only matches where a word begins.
    const shown = asSearchable(meta?.searchValue?.(row));
    if (shown !== null && shown !== '') values.push(String(shown));
    const raw = asSearchable(accessed);
    if (raw !== null) values.push(String(raw));
  });
  return values;
}

/** Name-like fields a row carries even when no column shows them (a class's own name, its trial). */
const NAME_FIELDS = ['name', 'label', 'trialName', 'trialLabel'] as const;

/** ONE lowercase haystack for the row: every column value, every displayed text, every name. */
export function searchHaystack<TData>(
  row: TData,
  columns: ReadonlyArray<ColumnDef<TData, unknown>>
): string {
  const names = NAME_FIELDS.map(field => asSearchable(readPath(row, field)))
    .filter((value): value is Searchable => value !== null)
    .map(String);
  return [...searchableValues(row, columns), ...names].join(' ').toLowerCase();
}

/** True when `token` appears in `haystack` starting at a word boundary ("a" finds "Novice A", not "Containers"). */
function startsAWord(haystack: string, token: string): boolean {
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(token, from);
    if (at === -1) return false;
    if (at === 0 || !/[a-z0-9]/.test(haystack.charAt(at - 1))) return true;
    from = at + 1;
  }
}

/**
 * A row matches when EVERY whitespace-separated word of the query starts a word somewhere in its
 * haystack, so word order and column boundaries do not matter ("Containers Novice A" finds the
 * row whose element is Containers and whose level shows "Novice A").
 */
export function matchesListSearch<TData>(
  row: TData,
  columns: ReadonlyArray<ColumnDef<TData, unknown>>,
  query: string
): boolean {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = searchHaystack(row, columns);
  const words = haystack.split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.every(token =>
    // A number must equal a whole numeric word ("2" finds "Trial 2", never "2026"; "05" stays
    // "05"); anything else matches at the start of a word.
    /^\d+$/.test(token) ? words.includes(token) : startsAWord(haystack, token)
  );
}

export function filterByListSearch<TData>(
  rows: readonly TData[],
  columns: ReadonlyArray<ColumnDef<TData, unknown>>,
  query: string
): TData[] {
  if (query.trim() === '') return [...rows];
  return rows.filter(row => matchesListSearch(row, columns, query));
}
