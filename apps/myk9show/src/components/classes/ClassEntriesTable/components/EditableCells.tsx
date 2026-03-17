/**
 * Editable cell components for inline editing
 */

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
import { parseTimeString, formatTimeComponents } from '../utils';

interface EditableCellProps {
  entryId: string;
  value: string;
  errors: FieldValidationError[];
  onUpdate: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}

/**
 * Editable status select cell
 */
export const StatusCell: React.FC<Omit<EditableCellProps, 'onKeyDown'>> = ({
  entryId,
  value,
  errors,
  onUpdate,
}) => {
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
      {errors
        .filter(err => err.field === 'status')
        .map((error, errIndex) => (
          <div key={errIndex} className="text-xs text-destructive">
            {error.message}
          </div>
        ))}
    </div>
  );
};

/**
 * Editable time cell with separate inputs for minutes, seconds, hundredths
 */
export const TimeCell: React.FC<EditableCellProps> = ({
  entryId,
  value,
  errors,
  onUpdate,
  onKeyDown,
}) => {
  const hasError = errors.some(err => err.field === 'time');
  const { minutes, seconds, hundredths } = parseTimeString(value);

  const updateTimeComponent = (
    component: 'minutes' | 'seconds' | 'hundredths',
    newValue: string
  ) => {
    const current = parseTimeString(value);
    let newMinutes = current.minutes;
    let newSeconds = current.seconds;
    let newHundredths = current.hundredths;

    if (component === 'minutes') newMinutes = newValue;
    if (component === 'seconds') newSeconds = newValue;
    if (component === 'hundredths') newHundredths = newValue;

    const formattedTime = formatTimeComponents(newMinutes, newSeconds, newHundredths);
    onUpdate(formattedTime);
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
      {errors
        .filter(err => err.field === 'time')
        .map((error, errIndex) => (
          <div key={errIndex} className="text-xs text-destructive">
            {error.message}
          </div>
        ))}
    </div>
  );
};

/**
 * Editable score cell
 */
export const ScoreCell: React.FC<EditableCellProps> = ({
  entryId,
  value,
  errors,
  onUpdate,
  onKeyDown,
}) => {
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
      {errors
        .filter(err => err.field === 'score')
        .map((error, errIndex) => (
          <div key={errIndex} className="text-xs text-destructive">
            {error.message}
          </div>
        ))}
    </div>
  );
};

/**
 * Editable placement cell
 */
export const PlacementCell: React.FC<EditableCellProps> = ({
  entryId,
  value,
  errors,
  onUpdate,
  onKeyDown,
}) => {
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
      {errors
        .filter(err => err.field === 'placement')
        .map((error, errIndex) => (
          <div key={errIndex} className="text-xs text-destructive">
            {error.message}
          </div>
        ))}
    </div>
  );
};
