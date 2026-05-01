/**
 * Class Availability Table
 *
 * Shows classes with their capacity and availability status
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import type { ClassWithCapacity } from '@/services/database/day-of-operations';

interface ClassAvailabilityTableProps {
  classes: ClassWithCapacity[];
  onAddEntry: () => void;
}

const classAvailabilityColumns: ColumnDef<ClassWithCapacity, unknown>[] = [
  {
    id: 'class',
    header: 'Class',
    accessorFn: row => row.name,
    cell: ({ row }) => (
      <span className="font-medium">
        {row.original.class_number && (
          <span className="text-muted-foreground mr-2">#{row.original.class_number}</span>
        )}
        {row.original.name}
      </span>
    ),
  },
  {
    accessorKey: 'max_entries',
    header: 'Limit',
    cell: ({ row }) => <div className="text-center">{row.original.max_entries ?? 'No limit'}</div>,
  },
  {
    accessorKey: 'accepted_count',
    header: 'Accepted',
    cell: ({ row }) => <div className="text-center">{row.original.accepted_count}</div>,
  },
  {
    accessorKey: 'available_spots',
    header: 'Available',
    cell: ({ row }) => <div className="text-center">{row.original.available_spots}</div>,
  },
  {
    id: 'status',
    header: 'Status',
    accessorFn: row => (row.available_spots > 0 ? 'Open' : 'Full'),
    cell: ({ row }) => (
      <div className="text-center">
        {row.original.available_spots > 0 ? (
          <Badge variant="default">Open</Badge>
        ) : (
          <Badge variant="destructive">Full</Badge>
        )}
      </div>
    ),
  },
];

export function ClassAvailabilityTable({ classes, onAddEntry }: ClassAvailabilityTableProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Class Availability</CardTitle>
            <CardDescription>Classes with available spots for day-of entries</CardDescription>
          </div>
          <Button onClick={onAddEntry}>
            <Plus className="mr-2 h-4 w-4" />
            Add Day-of Entry
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <DataTable
          tableId="classAvailability"
          columns={classAvailabilityColumns}
          data={classes}
          emptyState="No classes found"
        />
      </CardContent>
    </Card>
  );
}
