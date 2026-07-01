import React from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import type { ScoringRow, ScoringEdit } from './types';
import { PendingCell } from './PendingCell';

interface FaultsCellProps {
  item: ScoringRow;
  canEdit: boolean;
  visible: boolean;
  rowIndex: number;
  onFieldChange: (entryId: string, field: keyof ScoringEdit, value: string) => void;
  onKeyDown: (e: React.KeyboardEvent, rowIndex: number, field: string) => void;
}

export const FaultsCell: React.FC<FaultsCellProps> = ({
  item,
  canEdit,
  visible,
  rowIndex,
  onFieldChange,
  onKeyDown,
}) => {
  if (canEdit) {
    return (
      <Input
        type="number"
        value={item.faults}
        onChange={e => onFieldChange(item.entryId, 'faults', e.target.value)}
        onFocus={e => e.target.select()}
        onKeyDown={e => onKeyDown(e, rowIndex, 'faults')}
        min="0"
        max="99"
        className={cn('w-16', item.hasEdits && 'ring-2 ring-blue-500/30 border-blue-500')}
        data-index={rowIndex}
        data-field="faults"
      />
    );
  }
  if (!visible) return <PendingCell />;
  return <span className="text-sm">{item.faults}</span>;
};
