/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from 'react';
import type { Table } from '@tanstack/react-table';

const TableContext = createContext<Table<unknown> | null>(null);

export function useDataTableContext<TData>() {
  const ctx = useContext(TableContext) as Table<TData> | null;
  if (!ctx) throw new Error('useDataTableContext must be used within DataTableToolbar');
  return ctx;
}

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
  children: ReactNode;
}

export function DataTableToolbar<TData>({ table, children }: DataTableToolbarProps<TData>) {
  return (
    <TableContext.Provider value={table as unknown as Table<unknown>}>
      <div className="flex items-center justify-between gap-2 border-b border-border/50 px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
      </div>
    </TableContext.Provider>
  );
}
