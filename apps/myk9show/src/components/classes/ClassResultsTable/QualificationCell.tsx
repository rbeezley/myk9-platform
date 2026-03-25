/**
 * QualificationCell - Editable or read-only qualification status with reason dropdown
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { BulkEntryData } from './types';
import { QUALIFICATION_REASONS, STATUSES_REQUIRING_REASON } from './constants';

interface QualificationCellProps {
  item: BulkEntryData;
  canEdit: boolean;
  onUpdate: (entryId: string, field: keyof BulkEntryData, value: string) => void;
}

export const QualificationCell: React.FC<QualificationCellProps> = ({
  item,
  canEdit,
  onUpdate,
}) => {
  if (!canEdit) {
    return (
      <div>
        <div>
          <Badge variant={item.qualification === 'Qualified' ? 'default' : 'secondary'}>
            {item.qualification === 'Not Qualified' ? 'NQ' : item.qualification || 'Not Set'}
          </Badge>
        </div>
        {item.qualificationReason && (
          <div className="text-xs text-muted-foreground mt-1">{item.qualificationReason}</div>
        )}
      </div>
    );
  }

  const showReasonDropdown = STATUSES_REQUIRING_REASON.includes(item.qualification);

  return (
    <div className="space-y-1">
      <Select
        value={item.qualification}
        onValueChange={value => onUpdate(item.entryId, 'qualification', value)}
        data-field="qualification"
      >
        <SelectTrigger
          className={cn(
            'w-32',
            item.modifiedFields?.has('qualification') && 'ring-2 ring-blue-500/30 border-blue-500'
          )}
        >
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="Qualified">Qualified</SelectItem>
          <SelectItem value="Not Qualified">NQ</SelectItem>
          <SelectItem value="Absent">Absent</SelectItem>
          <SelectItem value="Excused">Excused</SelectItem>
          <SelectItem value="Withdrawn">Withdrawn</SelectItem>
        </SelectContent>
      </Select>

      {/* Conditional Reason Dropdown - Stacked Below */}
      {showReasonDropdown && (
        <Select
          value={item.qualificationReason}
          onValueChange={value => onUpdate(item.entryId, 'qualificationReason', value)}
          data-field="qualificationReason"
        >
          <SelectTrigger
            className={cn(
              'w-32 h-7 text-xs',
              item.modifiedFields?.has('qualificationReason') &&
                'ring-2 ring-blue-500/30 border-blue-500'
            )}
          >
            <SelectValue placeholder="Reason" />
          </SelectTrigger>
          <SelectContent>
            {QUALIFICATION_REASONS[item.qualification as keyof typeof QUALIFICATION_REASONS]?.map(
              reason => (
                <SelectItem key={reason} value={reason}>
                  {reason}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
      )}
    </div>
  );
};
