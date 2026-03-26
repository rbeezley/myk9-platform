/**
 * Class Availability Table
 *
 * Shows classes with their capacity and availability status
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus } from 'lucide-react';
import type { ClassWithCapacity } from '@/services/database/queries/dayOfOperationsQueries';

interface ClassAvailabilityTableProps {
  classes: ClassWithCapacity[];
  onAddEntry: () => void;
}

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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Class</TableHead>
              <TableHead className="text-center">Limit</TableHead>
              <TableHead className="text-center">Accepted</TableHead>
              <TableHead className="text-center">Available</TableHead>
              <TableHead className="text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {classes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No classes found
                </TableCell>
              </TableRow>
            ) : (
              classes.map(cls => (
                <TableRow key={cls.id}>
                  <TableCell className="font-medium">
                    {cls.class_number && (
                      <span className="text-muted-foreground mr-2">#{cls.class_number}</span>
                    )}
                    {cls.name}
                  </TableCell>
                  <TableCell className="text-center">{cls.max_entries || 'No limit'}</TableCell>
                  <TableCell className="text-center">{cls.accepted_count}</TableCell>
                  <TableCell className="text-center">{cls.available_spots}</TableCell>
                  <TableCell className="text-center">
                    {cls.available_spots > 0 ? (
                      <Badge variant="default">Open</Badge>
                    ) : (
                      <Badge variant="destructive">Full</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
