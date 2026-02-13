/**
 * ResultsTableRow - Single row in the ClassResultsTable
 *
 * Renders armband, dog info, placement, qualification, time, faults,
 * notes, status badge, and optional delete button.
 */

import React from 'react';
import { Trophy, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SimpleTimeFields } from '@/components/ui/simple-time-fields';
import { TableCell, TableRow } from '@/components/ui/table';

import type { ScentWorkEntry } from '@/types/scent-work-types';
import type { BulkEntryData } from './types';
import { getPlacementBadgeClass, formatPlacement } from './utils';
import { DogInfoTooltip } from './DogInfoTooltip';
import { QualificationCell } from './QualificationCell';
import { StatusBadge } from './StatusBadge';

interface ResultsTableRowProps {
  item: BulkEntryData;
  index: number;
  entry: ScentWorkEntry;
  canEdit: boolean;
  showDeleteColumn: boolean;
  validationError: string | undefined;
  onUpdate: (index: number, field: keyof BulkEntryData, value: string) => void;
  onKeyDown: (e: React.KeyboardEvent, index: number, field: string) => void;
  onDelete?: ((entryId: string) => void) | undefined;
}

export const ResultsTableRow: React.FC<ResultsTableRowProps> = ({
  item,
  index,
  entry,
  canEdit,
  showDeleteColumn,
  validationError,
  onUpdate,
  onKeyDown,
  onDelete,
}) => {
  return (
    <TableRow
      className={cn(
        'hover:bg-gray-50 dark:hover:bg-gray-800',
        item.hasChanges && !item.isValid && 'bg-red-50 dark:bg-red-950/20'
      )}
    >
      {/* Armband */}
      <TableCell className="font-medium">#{item.armband}</TableCell>

      {/* Dog & Handler */}
      <TableCell>
        <div>
          <DogInfoTooltip
            dogName={item.dogName}
            registrations={entry.registrations}
          />
          <div className="text-sm text-gray-600">{item.handlerName}</div>
        </div>
      </TableCell>

      {/* Placement */}
      <TableCell>
        {item.placement ? (
          <Badge
            variant="default"
            className={getPlacementBadgeClass(item.placement)}
          >
            <Trophy className="h-4 w-4" />
            {formatPlacement(item.placement)}
          </Badge>
        ) : (
          <span className="text-sm text-muted-foreground">--</span>
        )}
      </TableCell>

      {/* Qualification */}
      <TableCell>
        <QualificationCell
          item={item}
          index={index}
          canEdit={canEdit}
          onUpdate={onUpdate}
        />
      </TableCell>

      {/* Time */}
      <TableCell>
        {canEdit ? (
          <div className="flex justify-center">
            <div
              className={cn(
                'inline-block rounded-md',
                item.modifiedFields?.has('searchTime') &&
                  'ring-2 ring-blue-500/30'
              )}
            >
              <SimpleTimeFields
                value={item.searchTime}
                onChange={(value) => onUpdate(index, 'searchTime', value)}
                onKeyDown={(e) => onKeyDown(e, index, 'searchTime')}
                disabled={!canEdit}
                hideLabels={true}
                data-index={index}
                data-field="searchTime"
              />
            </div>
          </div>
        ) : (
          <div className="text-center">
            <span className="text-sm font-mono">
              {item.searchTime || '--'}
            </span>
          </div>
        )}
      </TableCell>

      {/* Faults */}
      <TableCell>
        {canEdit ? (
          <Input
            type="number"
            value={item.faults}
            onChange={(e) => onUpdate(index, 'faults', e.target.value)}
            onKeyDown={(e) => onKeyDown(e, index, 'faults')}
            min="0"
            max="99"
            className={cn(
              'w-16',
              item.modifiedFields?.has('faults') &&
                'ring-2 ring-blue-500/30 border-blue-500'
            )}
            data-index={index}
            data-field="faults"
          />
        ) : (
          <span className="text-sm">{item.faults}</span>
        )}
      </TableCell>

      {/* Notes */}
      <TableCell>
        {canEdit ? (
          <Input
            value={item.notes}
            onChange={(e) => onUpdate(index, 'notes', e.target.value)}
            onKeyDown={(e) => onKeyDown(e, index, 'notes')}
            placeholder="Optional notes"
            className={cn(
              'w-40',
              item.modifiedFields?.has('notes') &&
                'ring-2 ring-blue-500/30 border-blue-500'
            )}
            data-index={index}
            data-field="notes"
          />
        ) : (
          <span className="text-sm">{item.notes || '--'}</span>
        )}
      </TableCell>

      {/* Status */}
      <TableCell>
        <StatusBadge item={item} validationError={validationError} />
      </TableCell>

      {/* Delete */}
      {showDeleteColumn && onDelete && (
        <TableCell>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(item.entryId)}
            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
            title="Delete entry"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </TableCell>
      )}
    </TableRow>
  );
};
