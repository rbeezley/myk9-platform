import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TimeInput, formatSearchTime } from '@/components/ui/data-table';
import type { ScoringRow, ScoringEdit } from './types';
import { PendingCell } from './PendingCell';

interface SearchTimeCellProps {
  item: ScoringRow;
  canEdit: boolean;
  visible: boolean;
  rowIndex: number;
  onFieldChange: (entryId: string, field: keyof ScoringEdit, value: string) => void;
}

export const SearchTimeCell: React.FC<SearchTimeCellProps> = ({
  item,
  canEdit,
  visible,
  rowIndex,
  onFieldChange,
}) => {
  if (canEdit) {
    return (
      <div className="flex justify-center">
        <div className={cn('inline-block rounded-md', item.hasEdits && 'ring-2 ring-blue-500/30')}>
          <div className="flex items-center gap-1">
            <TimeInput
              value={item.searchTime}
              onChange={digits => onFieldChange(item.entryId, 'searchTime', formatSearchTime(digits))}
              onCommit={() => {
                // INTENT: committing a time jumps focus to the same row's Faults input
                // (Enter/Tab field navigation). Keep this selector in sync with FaultsCell's
                // data-index / data-field attributes.
                const next = document.querySelector(
                  `[data-index="${rowIndex}"][data-field="faults"]`
                ) as HTMLElement;
                next?.focus();
              }}
              onCancel={() => {}}
              className="w-24 h-8 text-center font-mono"
            />
            {item.searchTime && (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onMouseDown={e => e.preventDefault()}
                onClick={() => onFieldChange(item.entryId, 'searchTime', '')}
                title="Clear time"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
  if (!visible) return <PendingCell />;
  return (
    <div className="text-center">
      <span className="text-sm font-mono">{item.searchTime || '--'}</span>
    </div>
  );
};
