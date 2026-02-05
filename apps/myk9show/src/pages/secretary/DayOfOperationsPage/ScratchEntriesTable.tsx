/**
 * Scratch Entries Table
 *
 * Shows entries that can be scratched from classes
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
import { XCircle } from 'lucide-react';
import type { ScratchableEntry } from './types';

interface ScratchEntriesTableProps {
  entries: ScratchableEntry[];
  onScratch: (entry: ScratchableEntry) => void;
}

export function ScratchEntriesTable({ entries, onScratch }: ScratchEntriesTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Scratch Management</CardTitle>
        <CardDescription>Mark entries as scratched (no refund for day-of scratches)</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Armband</TableHead>
              <TableHead>Dog</TableHead>
              <TableHead>Handler</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Check-in</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No entries available to scratch
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-mono">{entry.entry?.armband_number || '-'}</TableCell>
                  <TableCell>
                    <div className="font-medium">{entry.entry?.dog?.name}</div>
                    {entry.entry?.dog?.call_name && (
                      <div className="text-sm text-muted-foreground">
                        "{entry.entry.dog.call_name}"
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{entry.entry?.handler || '-'}</TableCell>
                  <TableCell>
                    {entry.class?.class_number && (
                      <span className="text-muted-foreground mr-1">#{entry.class.class_number}</span>
                    )}
                    {entry.class?.name}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={entry.check_in_status === 'checked_in' ? 'default' : 'outline'}
                    >
                      {entry.check_in_status || 'pending'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="destructive" onClick={() => onScratch(entry)}>
                      <XCircle className="mr-2 h-4 w-4" />
                      Scratch
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
