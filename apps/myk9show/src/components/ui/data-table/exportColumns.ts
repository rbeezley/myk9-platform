import type { Column } from '@tanstack/react-table';
import type { DataTableColumnMeta } from './types';

/**
 * Which leaf columns a CSV export carries: every visible column except the
 * selection column and any marked `exportDisabled`, plus hidden columns marked
 * `exportHidden` — a column can start hidden on screen (see
 * `defaultColumnVisibility`) and still belong in the file.
 */
export function pickExportColumns<TData>(
  columns: Column<TData, unknown>[]
): Column<TData, unknown>[] {
  return columns.filter(column => {
    if (column.id === '_select') return false;
    const meta = column.columnDef.meta as DataTableColumnMeta | undefined;
    if (meta?.exportDisabled) return false;
    return column.getIsVisible() || meta?.exportHidden === true;
  });
}
