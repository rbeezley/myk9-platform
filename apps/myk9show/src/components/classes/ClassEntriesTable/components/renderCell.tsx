import type { KeyboardEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import type { Row } from '@tanstack/react-table';
import type { ColumnDataType } from '@/types/table-column-types';
import type { EntryData } from '../../types/classTypes';
import type { InlineEditEntry } from '../types';
import { getStatusColor, getPlacementStyle } from '../utils';
import { EditableField } from './InlineEditCells';
import type { DisplayRow } from '../ClassEntriesTable';

const EDITABLE_COLUMNS = new Set(['time', 'status', 'score', 'placement']);

export interface RenderCellOptions {
  row: Row<DisplayRow>;
  columnId: string;
  dataType: ColumnDataType;
  enableInlineEditing: boolean;
  getEditData: (entry: EntryData) => InlineEditEntry;
  updateInlineEditData: (entryId: string, field: string, value: string) => void;
  handleKeyDown: (event: KeyboardEvent, entryId: string, field: string, rowIndex: number) => void;
  align?: 'left' | 'center' | 'right';
}

export function renderCell({
  row,
  columnId,
  dataType,
  enableInlineEditing,
  getEditData,
  updateInlineEditData,
  handleKeyDown,
  align,
}: RenderCellOptions) {
  const cellData = row.original.transformed[columnId] as Record<string, unknown> | undefined;
  const rawValue = cellData?.raw;
  const formattedValue = cellData?.formatted || '--';
  const cellClassName = (cellData?.className as string) || '';

  const alignClass = align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : '';

  if (enableInlineEditing && EDITABLE_COLUMNS.has(columnId)) {
    const entry = row.original.entry;
    const editData = getEditData(entry);
    return (
      <div className={[alignClass, cellClassName].filter(Boolean).join(' ') || undefined}>
        <EditableField
          columnId={columnId}
          entry={entry}
          editData={editData}
          rowIndex={row.index}
          onUpdate={(field, value) => updateInlineEditData(entry.id, field, value)}
          onKeyDown={handleKeyDown}
        />
      </div>
    );
  }

  if (dataType === 'status') {
    return (
      <div className={alignClass || undefined}>
        <Badge
          variant="secondary"
          className={`${getStatusColor(String(formattedValue || ''))} border-0`}
        >
          {String(formattedValue || '')}
        </Badge>
      </div>
    );
  }

  if (dataType === 'placement') {
    return (
      <div className={alignClass || undefined}>
        <span className={getPlacementStyle(String(rawValue || ''))}>
          {String(formattedValue || '')}
        </span>
      </div>
    );
  }

  return (
    <span className={[alignClass, cellClassName].filter(Boolean).join(' ') || undefined}>
      {String(formattedValue || '')}
    </span>
  );
}
