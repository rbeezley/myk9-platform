/**
 * ClassStatusDialog — set a class's status at ringside (v3 parity, MYK9-1513).
 *
 * Eight choices, each with a one-line description. Briefing, Break and Start Time
 * ask for a time first: Briefing's time and Break's "until" time are the class's
 * phase time, and Start Time is its Expected start. The choice is written through
 * `onStatusChange`, which sets the class status and ring phase together
 * (`ringsideCapabilities`), so it queues offline like every other class write.
 * Which roles see the dialog is decided upstream by the Status entry in
 * ClassOptionsDialog; nothing here widens it.
 */
import { useState } from 'react';
import type React from 'react';
import type { ClassStatusDialogProps, ClassStatusValue } from '@myk9/ringside';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { handleOpenChange } from './dialogHelpers';

interface StatusOption {
  value: ClassStatusValue;
  label: string;
  description: string;
  /** The label of the time this status asks for, when it asks for one. */
  timeLabel?: string;
}

export const CLASS_STATUS_OPTIONS: readonly StatusOption[] = [
  { value: 'no-status', label: 'No Status', description: 'Clear the class status' },
  { value: 'setup', label: 'Setup', description: 'Ring is being set up' },
  {
    value: 'briefing',
    label: 'Briefing',
    description: 'Judge is briefing handlers',
    timeLabel: 'Briefing time',
  },
  {
    value: 'break',
    label: 'Break',
    description: 'Class is paused for a break',
    timeLabel: 'Break until',
  },
  {
    value: 'start_time',
    label: 'Start Time',
    description: 'Announce when the class will start',
    timeLabel: 'Start time',
  },
  { value: 'in_progress', label: 'In Progress', description: 'Dogs are being judged' },
  {
    value: 'offline-scoring',
    label: 'Offline Scoring',
    description: 'Judging offline - run order delayed',
  },
  { value: 'completed', label: 'Completed', description: 'Class has finished' },
];

type ClassData = ClassStatusDialogProps['classData'];

/** The time already on the class for a status, to prefill its input. */
function savedTime(status: ClassStatusValue, classData: ClassData): string {
  switch (status) {
    case 'briefing':
      return classData.briefing_time ?? '';
    case 'break':
      return classData.break_until_time ?? '';
    case 'start_time':
      return classData.start_time ?? '';
    default:
      return '';
  }
}

/**
 * The host keeps this slot mounted while closed, so the form mounts fresh on every
 * open (and per class): an abandoned half-chosen status is gone.
 */
export const ClassStatusDialog: React.FC<ClassStatusDialogProps> = props =>
  props.isOpen ? <ClassStatusForm key={props.classData.id} {...props} /> : null;

const ClassStatusForm: React.FC<ClassStatusDialogProps> = ({
  onClose,
  onStatusChange,
  classData,
  currentStatus,
  onMarkAbsent,
}) => {
  const [picked, setPicked] = useState<StatusOption | null>(null);
  const [time, setTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (status: ClassStatusValue, timeValue?: string) => {
    setSaving(true);
    setError(null);
    try {
      await onStatusChange(status, timeValue);
      onClose();
    } catch {
      setError('Could not change the status. Try again.');
      setSaving(false);
    }
  };

  const choose = (option: StatusOption) => {
    if (option.timeLabel) {
      setPicked(option);
      setTime(savedTime(option.value, classData));
      setError(null);
      return;
    }
    void save(option.value);
  };

  return (
    <Dialog open onOpenChange={open => handleOpenChange(open, onClose)}>
      {/* Eight two-line options plus the time form outgrow a phone: cap at the viewport and scroll. */}
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{classData.class_name} — Status</DialogTitle>
        </DialogHeader>
        <div role="group" aria-label="Class status" className="flex flex-col gap-2">
          {CLASS_STATUS_OPTIONS.map(option => {
            const isCurrent = option.value === currentStatus;
            return (
              <Button
                key={option.value}
                variant="outline"
                disabled={saving}
                aria-current={isCurrent || undefined}
                onClick={() => choose(option)}
                className={cn(
                  'h-auto min-h-12 flex-col items-start gap-0.5 whitespace-normal py-2 text-left',
                  isCurrent && 'border-primary'
                )}
              >
                <span className="flex w-full items-center justify-between gap-2 font-medium">
                  <span>{option.label}</span>
                  {isCurrent && <span className="text-xs font-normal text-primary">Current</span>}
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                  {option.description}
                </span>
              </Button>
            );
          })}
        </div>
        {picked?.timeLabel && (
          <form
            className="flex flex-col gap-2"
            onSubmit={event => {
              event.preventDefault();
              if (time) void save(picked.value, time);
            }}
          >
            <Label htmlFor="class-status-time">{picked.timeLabel}</Label>
            <Input
              id="class-status-time"
              type="time"
              value={time}
              onChange={event => setTime(event.target.value)}
              required
              autoFocus
            />
            <Button type="submit" disabled={saving || !time}>
              Set {picked.label}
            </Button>
          </form>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {onMarkAbsent && (
          <Button variant="outline" disabled={saving} onClick={() => void onMarkAbsent()}>
            Mark Unscored Absent
          </Button>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
