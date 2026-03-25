import React from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { FieldValidationError } from '@/utils/entryValidation';
import { EntryData } from '../../types/classTypes';
import { InlineEditEntry } from '../types';
import { parseTimeString, formatTimeComponents } from '../utils';

/** Props for the main EditableField dispatcher */
export interface EditableFieldProps {
  columnId: string;
  entry: EntryData;
  editData: InlineEditEntry;
  rowIndex: number;
  onUpdate: (field: string, value: string) => void;
  onKeyDown: (event: React.KeyboardEvent, entryId: string, field: string, rowIndex: number) => void;
}

/** Dispatches to the appropriate editable cell based on column ID */
export function EditableField({
  columnId,
  entry,
  editData,
  rowIndex,
  onUpdate,
  onKeyDown,
}: EditableFieldProps) {
  if (columnId === 'status') {
    return (
      <StatusEditCell
        entryId={entry.id}
        value={editData.status}
        errors={editData.errors}
        onUpdate={value => onUpdate('status', value)}
      />
    );
  }

  if (columnId === 'time') {
    return (
      <TimeEditCell
        entryId={entry.id}
        value={editData.time}
        errors={editData.errors}
        onUpdate={value => onUpdate('time', value)}
        onKeyDown={e => onKeyDown(e, entry.id, 'time', rowIndex)}
      />
    );
  }

  if (columnId === 'score') {
    return (
      <ScoreEditCell
        entryId={entry.id}
        value={editData.score}
        errors={editData.errors}
        onUpdate={value => onUpdate('score', value)}
        onKeyDown={e => onKeyDown(e, entry.id, 'score', rowIndex)}
      />
    );
  }

  if (columnId === 'placement') {
    return (
      <PlacementEditCell
        entryId={entry.id}
        value={editData.placement}
        errors={editData.errors}
        onUpdate={value => onUpdate('placement', value)}
        onKeyDown={e => onKeyDown(e, entry.id, 'placement', rowIndex)}
      />
    );
  }

  return null;
}

// ---- Individual cell editors ----

interface EditCellBaseProps {
  entryId: string;
  value: string;
  errors: FieldValidationError[];
  onUpdate: (value: string) => void;
}

interface EditCellWithKeyDownProps extends EditCellBaseProps {
  onKeyDown: (event: React.KeyboardEvent) => void;
}

function StatusEditCell({ entryId, value, errors, onUpdate }: EditCellBaseProps) {
  const hasError = errors.some(err => err.field === 'status');
  return (
    <div className="space-y-1">
      <Select value={value} onValueChange={onUpdate} data-entry-id={entryId} data-field="status">
        <SelectTrigger className={cn('w-32 h-8', hasError && 'border-destructive')}>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="Qualified">Qualified</SelectItem>
          <SelectItem value="Not Qualified">Not Qualified</SelectItem>
          <SelectItem value="Absent">Absent</SelectItem>
          <SelectItem value="Withdrawn">Withdrawn</SelectItem>
          <SelectItem value="Eliminated">Eliminated</SelectItem>
        </SelectContent>
      </Select>
      <FieldErrors errors={errors} field="status" />
    </div>
  );
}

function TimeEditCell({ entryId, value, errors, onUpdate, onKeyDown }: EditCellWithKeyDownProps) {
  const hasError = errors.some(err => err.field === 'time');
  const { minutes, seconds, hundredths } = parseTimeString(value);

  const updateTimeComponent = (
    component: 'minutes' | 'seconds' | 'hundredths',
    newValue: string
  ) => {
    let m = minutes;
    let s = seconds;
    let h = hundredths;
    if (component === 'minutes') m = newValue;
    if (component === 'seconds') s = newValue;
    if (component === 'hundredths') h = newValue;
    onUpdate(formatTimeComponents(m, s, h));
  };

  return (
    <div className="space-y-1">
      <div className="flex justify-center gap-1">
        <Input
          value={minutes}
          onChange={e => updateTimeComponent('minutes', e.target.value)}
          onKeyDown={onKeyDown}
          placeholder=""
          className={cn('w-12 h-8 text-center font-mono', hasError && 'border-destructive')}
          data-entry-id={entryId}
          data-field="time"
          maxLength={2}
        />
        <span className="text-lg px-1 font-mono self-center">:</span>
        <Input
          value={seconds}
          onChange={e => updateTimeComponent('seconds', e.target.value)}
          onKeyDown={onKeyDown}
          placeholder=""
          className={cn('w-12 h-8 text-center font-mono', hasError && 'border-destructive')}
          data-entry-id={entryId}
          data-field="time"
          maxLength={2}
        />
        <span className="text-lg px-1 font-mono self-center">.</span>
        <Input
          value={hundredths}
          onChange={e => updateTimeComponent('hundredths', e.target.value)}
          onKeyDown={onKeyDown}
          placeholder=""
          className={cn('w-12 h-8 text-center font-mono', hasError && 'border-destructive')}
          data-entry-id={entryId}
          data-field="time"
          maxLength={2}
        />
      </div>
      <FieldErrors errors={errors} field="time" />
    </div>
  );
}

function ScoreEditCell({ entryId, value, errors, onUpdate, onKeyDown }: EditCellWithKeyDownProps) {
  const hasError = errors.some(err => err.field === 'score');
  return (
    <div className="space-y-1">
      <Input
        value={value}
        onChange={e => onUpdate(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="0"
        className={cn('w-16 h-8', hasError && 'border-destructive')}
        data-entry-id={entryId}
        data-field="score"
      />
      <FieldErrors errors={errors} field="score" />
    </div>
  );
}

function PlacementEditCell({
  entryId,
  value,
  errors,
  onUpdate,
  onKeyDown,
}: EditCellWithKeyDownProps) {
  const hasError = errors.some(err => err.field === 'placement');
  return (
    <div className="space-y-1">
      <Input
        value={value}
        onChange={e => onUpdate(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="1"
        className={cn('w-12 h-8', hasError && 'border-destructive')}
        data-entry-id={entryId}
        data-field="placement"
      />
      <FieldErrors errors={errors} field="placement" />
    </div>
  );
}

function FieldErrors({ errors, field }: { errors: FieldValidationError[]; field: string }) {
  const fieldErrors = errors.filter(err => err.field === field);
  if (fieldErrors.length === 0) return null;
  return (
    <>
      {fieldErrors.map((error, i) => (
        <div key={i} className="text-xs text-destructive">
          {error.message}
        </div>
      ))}
    </>
  );
}
