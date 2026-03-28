import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ScoringRow } from './types';
import { QUALIFICATION_REASONS, STATUSES_REQUIRING_REASON } from './constants';

interface QualificationCellProps {
  item: ScoringRow;
  canEdit: boolean;
  visible: boolean;
  onUpdate: (entryId: string, field: string, value: string) => void;
}

const DISPLAY_LABELS: Record<string, string> = {
  Qualified: 'Q',
  'Not Qualified': 'NQ',
  Absent: 'ABS',
  Excused: 'EXC',
  Withdrawn: 'WD',
};

export const QualificationCell: React.FC<QualificationCellProps> = ({
  item,
  canEdit,
  visible,
  onUpdate,
}) => {
  if (!visible) {
    return <span className="text-sm text-muted-foreground italic">Pending</span>;
  }

  if (!canEdit) {
    return (
      <div>
        <div>
          <Badge variant={item.qualification === 'Qualified' ? 'default' : 'secondary'}>
            {DISPLAY_LABELS[item.qualification] || item.qualification || 'Not Set'}
          </Badge>
        </div>
        {item.qualificationReason && (
          <div className="text-xs text-muted-foreground mt-1">{item.qualificationReason}</div>
        )}
      </div>
    );
  }

  const showReasonDropdown = STATUSES_REQUIRING_REASON.includes(item.qualification);

  const handleClear = () => {
    onUpdate(item.entryId, 'qualification', '');
    onUpdate(item.entryId, 'qualificationReason', '');
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <Select
          value={item.qualification}
          onValueChange={value => onUpdate(item.entryId, 'qualification', value)}
          data-field="qualification"
        >
          <SelectTrigger
            className={cn('w-32', item.hasEdits && 'ring-2 ring-blue-500/30 border-blue-500')}
          >
            <SelectValue placeholder="Select">
              {DISPLAY_LABELS[item.qualification] || item.qualification}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Qualified">Qualified</SelectItem>
            <SelectItem value="Not Qualified">NQ</SelectItem>
            <SelectItem value="Absent">Absent</SelectItem>
            <SelectItem value="Excused">Excused</SelectItem>
            <SelectItem value="Withdrawn">Withdrawn</SelectItem>
          </SelectContent>
        </Select>
        {item.qualification && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={handleClear}
            title="Clear qualification"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {showReasonDropdown && (
        <Select
          value={item.qualificationReason}
          onValueChange={value => onUpdate(item.entryId, 'qualificationReason', value)}
          data-field="qualificationReason"
        >
          <SelectTrigger
            className={cn(
              'w-44 h-7 text-xs',
              item.hasEdits && 'ring-2 ring-blue-500/30 border-blue-500'
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
