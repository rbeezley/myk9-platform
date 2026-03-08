/**
 * SortableTable — generic sortable table component.
 *
 * Extracts the common boilerplate shared by ShowsTableView, TrialsTableView,
 * ClassesTableView, and EntriesTableView into a single reusable component.
 *
 * Handles sort state, toggling, sorted-item memoization, and renders the
 * full table shell (rounded-xl border container, header buttons with sort
 * icons, rows with hover/cursor classes).
 */

import React, { type ReactNode, useState, useMemo } from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';

export type SortDirection = 'asc' | 'desc';

export interface ColumnDef<T> {
  key: string;
  label: string;
  getValue: (item: T) => string;
  className?: string;
}

interface SortableTableProps<T> {
  items: T[];
  columns: ColumnDef<T>[];
  onRowClick?: ((item: T) => void) | undefined;
  defaultSortColumn?: string;
  defaultSortDirection?: SortDirection;
  renderCell: (item: T, column: ColumnDef<T>) => ReactNode;
  emptyMessage?: string;
  getRowKey: (item: T) => string;
}

function SortableTableInner<T>(
  {
    items,
    columns,
    onRowClick,
    defaultSortColumn,
    defaultSortDirection = 'asc',
    renderCell,
    emptyMessage = 'No items found.',
    getRowKey,
  }: SortableTableProps<T>,
  _ref: React.Ref<HTMLDivElement>
) {
  const [sortColumn, setSortColumn] = useState(defaultSortColumn ?? columns[0]?.key ?? '');
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSortDirection);

  const handleSort = (columnKey: string) => {
    if (sortColumn === columnKey) {
      setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(columnKey);
      setSortDirection('asc');
    }
  };

  const activeColumn = columns.find(c => c.key === sortColumn);

  const sortedItems = useMemo(() => {
    if (!activeColumn) return items;
    const dir = sortDirection === 'asc' ? 1 : -1;
    return [...items].sort(
      (a, b) => activeColumn.getValue(a).localeCompare(activeColumn.getValue(b)) * dir
    );
  }, [items, activeColumn, sortDirection]);

  return (
    <div className="rounded-xl border border-border/50 bg-card/95 backdrop-blur-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50 bg-muted/30">
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left font-medium text-muted-foreground ${col.className ?? ''}`}
                >
                  <button
                    type="button"
                    className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}
                    {sortColumn === col.key ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30" />
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedItems.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sortedItems.map(item => (
                <tr
                  key={getRowKey(item)}
                  className={`border-b border-border/30 hover:bg-muted/20 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
                  onClick={() => onRowClick?.(item)}
                >
                  {columns.map(col => (
                    <React.Fragment key={col.key}>{renderCell(item, col)}</React.Fragment>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Use a type-assertion to preserve the generic while wrapping with forwardRef-style export.
// React.forwardRef doesn't support generics natively, so we export the inner function directly.
export const SortableTable = SortableTableInner as <T>(
  props: SortableTableProps<T>
) => React.ReactElement;
