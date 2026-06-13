import React from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SimpleTimeFields } from '@/components/ui/simple-time-fields';
import { TableCell, TableRow } from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type { BulkEntryData } from './types';

interface EntryTableRowProps {
  item: BulkEntryData;
  index: number;
  validationError?: string | undefined;
  onFieldChange: (index: number, field: keyof BulkEntryData, value: string) => void;
  onKeyDown: (event: React.KeyboardEvent, index: number, field: string) => void;
}

export function EntryTableRow({
  item,
  index,
  validationError,
  onFieldChange,
  onKeyDown,
}: EntryTableRowProps) {
  return (
    <TableRow
      key={item.entryId}
      className={cn(
        'hover:bg-gray-50 dark:hover:bg-gray-800',
        item.hasChanges && !item.isValid && 'bg-destructive/10 '
      )}
    >
      <TableCell className="font-medium">#{item.armband}</TableCell>
      <TableCell>
        <div>
          <div className="font-medium">{item.dogName}</div>
          <div className="text-sm text-gray-600">{item.handlerName}</div>
        </div>
      </TableCell>
      <TableCell>
        <SimpleTimeFields
          value={item.searchTime}
          onChange={value => onFieldChange(index, 'searchTime', value)}
          onKeyDown={e => onKeyDown(e, index, 'searchTime')}
          data-index={index}
          data-field="searchTime"
        />
      </TableCell>
      <TableCell>
        <Select
          value={item.qualification}
          onValueChange={value => onFieldChange(index, 'qualification', value)}
          data-index={index}
          data-field="qualification"
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Qualified">Qualified</SelectItem>
            <SelectItem value="Not Qualified">Not Qualified</SelectItem>
            <SelectItem value="Absent">Absent</SelectItem>
            <SelectItem value="Excused">Excused</SelectItem>
            <SelectItem value="Withdrawn">Withdrawn</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input
          type="number"
          value={item.faults}
          onChange={e => onFieldChange(index, 'faults', e.target.value)}
          onKeyDown={e => onKeyDown(e, index, 'faults')}
          min="0"
          max="99"
          className="w-16"
          data-index={index}
          data-field="faults"
        />
      </TableCell>
      <TableCell>
        <Input
          value={item.notes}
          onChange={e => onFieldChange(index, 'notes', e.target.value)}
          onKeyDown={e => onKeyDown(e, index, 'notes')}
          placeholder="Optional notes"
          className="w-40"
          data-index={index}
          data-field="notes"
        />
      </TableCell>
      <TableCell>
        {item.hasChanges ? (
          item.isValid ? (
            <Badge variant="default" className="flex items-center space-x-1">
              <CheckCircle className="h-3 w-3" />
              <span>Valid</span>
            </Badge>
          ) : (
            <Badge variant="destructive" className="flex items-center space-x-1">
              <AlertCircle className="h-3 w-3" />
              <span>Invalid</span>
            </Badge>
          )
        ) : (
          <Badge variant="outline">Empty</Badge>
        )}
        {validationError && <div className="text-xs text-red-600 mt-1">{validationError}</div>}
      </TableCell>
    </TableRow>
  );
}
