import { useReactTable, getCoreRowModel, flexRender, type ColumnDef } from '@tanstack/react-table';
import { DndContext, closestCenter, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow as TableRowPrimitive,
} from '@/components/ui/table';
import { SortableRow } from './SortableRow';
import type { ScoringRow } from './types';
import { useMemo } from 'react';

interface DndTableViewProps {
  columns: ColumnDef<ScoringRow, unknown>[];
  orderedRows: ScoringRow[];
  sensors: ReturnType<typeof useSensors>;
  onDragEnd: (event: DragEndEvent) => Promise<void>;
}

export function DndTableView({ columns, orderedRows, sensors, onDragEnd }: DndTableViewProps) {
  const table = useReactTable({
    data: orderedRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: row => row.entryId,
  });

  const sortableItems = useMemo(() => orderedRows.map(r => r.entryId), [orderedRows]);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={sortableItems} strategy={verticalListSortingStrategy}>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map(hg => (
              <TableRowPrimitive key={hg.id}>
                {hg.headers.map(header => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRowPrimitive>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row, idx) => (
              <SortableRow key={row.id} id={row.id} position={idx + 1}>
                {row.getVisibleCells().map(cell => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </SortableRow>
            ))}
          </TableBody>
        </Table>
      </SortableContext>
    </DndContext>
  );
}
