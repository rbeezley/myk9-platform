import React, { ReactNode } from 'react';
import { logger } from '@/services/LoggingService';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildClasses } from '@/utils/designTokens';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  accessor: (row: T) => ReactNode;
  className?: string;
}

export interface DataTableProps<T> {
  title?: string;
  description?: string;
  data: T[];
  columns: DataTableColumn<T>[];
  onAdd?: () => void;
  addLabel?: string;
  emptyMessage?: string;
  actions?: (row: T) => ReactNode;
  className?: string;
  tableClassName?: string;
}

export function DataTable<T extends { id: string }>({
  title,
  description,
  data,
  columns,
  onAdd,
  addLabel = 'Add',
  emptyMessage = 'No data available',
  actions,
  className,
  tableClassName,
}: DataTableProps<T>) {
  return (
    <Card className={cn(buildClasses.card.base, className)}>
      {(title || onAdd) && (
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              {title && <CardTitle>{title}</CardTitle>}
              {description && (
                <p className="text-sm text-muted-foreground mt-1">
                  {description}
                </p>
              )}
            </div>
            {onAdd && (
              <Button onClick={onAdd} size="sm">
                <Plus className="h-4 w-4 mr-1" />
                {addLabel}
              </Button>
            )}
          </div>
        </CardHeader>
      )}
      <CardContent className={cn('p-0', !title && !onAdd && 'pt-6')}>
        {data.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          <Table className={tableClassName}>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column.key} className={column.className}>
                    {column.header}
                  </TableHead>
                ))}
                {actions && <TableHead className="w-[50px]">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.id}>
                  {columns.map((column) => (
                    <TableCell key={column.key} className={column.className}>
                      {column.accessor(row)}
                    </TableCell>
                  ))}
                  {actions && (
                    <TableCell>
                      {actions(row)}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}