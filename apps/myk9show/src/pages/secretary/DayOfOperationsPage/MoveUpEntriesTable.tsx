/**
 * Move-Up Entries Table
 *
 * Shows entries eligible for move-up to a higher class
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
import { ArrowUpCircle } from 'lucide-react';
import type { ScratchableEntry } from './types';

interface MoveUpEntriesTableProps {
  entries: ScratchableEntry[];
  onMoveUp: (entry: ScratchableEntry) => void;
}

export function MoveUpEntriesTable({ entries, onMoveUp }: MoveUpEntriesTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Move-Up Eligible Entries</CardTitle>
        <CardDescription>Entries that can be moved to a higher class after qualifying</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Armband</TableHead>
              <TableHead>Dog</TableHead>
              <TableHead>Handler</TableHead>
              <TableHead>Current Class</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No entries available for move-up
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-mono">{entry.armband || '-'}</TableCell>
                  <TableCell>
                    <div className="font-medium">{entry.dog?.name}</div>
                    {entry.dog?.call_name && (
                      <div className="text-sm text-muted-foreground">
                        "{entry.dog.call_name}"
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{entry.handler || '-'}</TableCell>
                  <TableCell>
                    {entry.class?.class_number && (
                      <span className="text-muted-foreground mr-1">#{entry.class.class_number}</span>
                    )}
                    {entry.class?.name}
                  </TableCell>
                  <TableCell>
                    <Badge variant={entry.entry_status === 'checked_in' ? 'default' : 'outline'}>
                      {entry.entry_status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" onClick={() => onMoveUp(entry)}>
                      <ArrowUpCircle className="mr-2 h-4 w-4" />
                      Move Up
                    </Button>
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
