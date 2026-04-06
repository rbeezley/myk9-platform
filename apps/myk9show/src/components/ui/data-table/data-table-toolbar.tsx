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
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2 flex-1">{children}</div>
      </div>
    </TableContext.Provider>
  );
}
