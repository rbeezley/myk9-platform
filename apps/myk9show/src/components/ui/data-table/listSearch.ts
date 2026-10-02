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
    const raw = asSearchable(accessed);
    if (raw !== null) values.push(String(raw));
    const meta = column.meta as DataTableColumnMeta | undefined;
    const shown = asSearchable(meta?.searchValue?.(row));
    if (shown !== null) values.push(String(shown));
  });
  return values;
}

export function matchesListSearch<TData>(
  row: TData,
  columns: ReadonlyArray<ColumnDef<TData, unknown>>,
  query: string
): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return searchableValues(row, columns).some(value => value.toLowerCase().includes(needle));
}

export function filterByListSearch<TData>(
  rows: readonly TData[],
  columns: ReadonlyArray<ColumnDef<TData, unknown>>,
  query: string
): TData[] {
  if (query.trim() === '') return [...rows];
  return rows.filter(row => matchesListSearch(row, columns, query));
}
