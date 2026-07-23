import { useEffect, useState } from 'react';
import { Check, ChevronDown, Clock3, Pencil, X } from 'lucide-react';
import { CLASS_STATUS, type ClassStatusValue } from '@myk9/core';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { applyManualClassStatus } from '@/services/show-day/classStatusMutations';
import { setRevisedExpectedStart } from '@/services/show-day/classTimingMutations';
import { cn } from '@/lib/utils';

import { clockTimeToInstant, instantToClockTime } from './cockpitTime';
import type { CockpitLifecycle } from './secretaryCockpitTypes';

const STATUS_OPTIONS: readonly { value: ClassStatusValue; label: string }[] = [
  { value: CLASS_STATUS.SCHEDULED, label: 'Not started' },
  { value: CLASS_STATUS.IN_PROGRESS, label: 'In progress' },
  { value: CLASS_STATUS.COMPLETED, label: 'Complete' },
  { value: CLASS_STATUS.CANCELLED, label: 'Cancelled' },
];

const STATUS_LABEL: Record<CockpitLifecycle, string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  complete: 'Complete',
  cancelled: 'Cancelled',
};

export function ClassStatusControl({
  classId,
  lifecycle,
  unenteredScoreCount = 0,
  canManageShow,
}: {
  classId: string;
  lifecycle: CockpitLifecycle | null;
  unenteredScoreCount?: number;
  canManageShow: boolean;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const label = lifecycle ? STATUS_LABEL[lifecycle] : 'Status unknown';
  const tone =
    lifecycle === 'complete'
      ? 'border-success/30 bg-success/10 text-success'
      : lifecycle === 'in-progress'
        ? 'border-warning/30 bg-warning/10 text-warning'
        : lifecycle === 'cancelled'
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : 'border-border bg-muted text-foreground';

  if (!canManageShow) {
    return (
      <span className={cn('rounded-full border px-2.5 py-1 text-xs font-semibold', tone)}>
        {label}
      </span>
    );
  }

  const update = async (status: ClassStatusValue) => {
    if (
      status === CLASS_STATUS.COMPLETED &&
      unenteredScoreCount > 0 &&
      !window.confirm(
        `${unenteredScoreCount} paper ${unenteredScoreCount === 1 ? 'score still needs' : 'scores still need'} entry. Mark this Class complete anyway?`
      )
    ) {
      return;
    }
    setIsSaving(true);
    try {
      await applyManualClassStatus(classId, status);
      toast.success(
        `Class status changed to ${STATUS_OPTIONS.find(option => option.value === status)?.label}.`
      );
    } catch {
      toast.error('Class status could not be changed.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={isSaving}
          aria-label={`Change class status. Current status: ${label}`}
          className={cn(
            'inline-flex min-h-11 items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition hover:brightness-95 disabled:opacity-60',
            tone
          )}
        >
          {label}
          <ChevronDown className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {STATUS_OPTIONS.filter(option => option.value !== CLASS_STATUS.CANCELLED).map(option => (
          <DropdownMenuItem
            key={option.value}
            disabled={option.label === label}
            onClick={() => void update(option.value)}
          >
            {option.label}
            {option.label === label && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={label === 'Cancelled'}
          className="text-destructive focus:text-destructive"
          onClick={() => void update(CLASS_STATUS.CANCELLED)}
        >
          Cancelled
          {label === 'Cancelled' && <Check className="ml-auto h-4 w-4" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function scheduledClockValue(value: string | null): string {
  const match = value?.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return '';
  let hour = Number(match[1]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem) hour = (hour % 12) + (meridiem === 'PM' ? 12 : 0);
  return `${String(hour).padStart(2, '0')}:${match[2]}`;
}

export function ExpectedStartControl({
  classId,
  scheduledStart,
  revisedExpectedStart,
  trialDate,
  timeZone,
  canManageShow,
}: {
  classId: string;
  scheduledStart: string | null;
  revisedExpectedStart: string | null;
  trialDate: string;
  timeZone: string;
  canManageShow: boolean;
}) {
  const effective =
    instantToClockTime(revisedExpectedStart, timeZone) || scheduledClockValue(scheduledStart);
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(effective);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => setValue(effective), [effective]);

  if (!canManageShow || !isEditing) {
    return (
      <button
        type="button"
        disabled={!canManageShow}
        onClick={() => setIsEditing(true)}
        className="group inline-flex min-h-11 items-center gap-1.5 text-left text-sm font-semibold text-foreground disabled:cursor-default"
      >
        <Clock3 className="h-4 w-4 text-muted-foreground" />
        {effective || 'Set expected start'}
        {canManageShow && (
          <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-60 group-hover:opacity-100" />
        )}
      </button>
    );
  }

  const save = async () => {
    if (!value) return;
    setIsSaving(true);
    try {
      await setRevisedExpectedStart(classId, clockTimeToInstant(trialDate, value, timeZone));
      setIsEditing(false);
      toast.success('Expected start updated. The scheduled time was preserved.');
    } catch {
      toast.error('Expected start could not be updated.');
    } finally {
      setIsSaving(false);
    }
  };

  const revertToScheduled = async () => {
    setIsSaving(true);
    try {
      await setRevisedExpectedStart(classId, null);
      setIsEditing(false);
      toast.success('Reverted to the scheduled time.');
    } catch {
      toast.error('Could not revert to the scheduled time.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input
        type="time"
        value={value}
        onChange={event => setValue(event.target.value)}
        aria-label="Revised expected start"
        className="min-h-11 rounded-md border border-input bg-background px-2 text-sm text-foreground"
      />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={() => void save()}
        disabled={!value || isSaving}
        aria-label="Save expected start"
        className="h-11 w-11"
      >
        <Check className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={() => setIsEditing(false)}
        disabled={isSaving}
        aria-label="Cancel expected start edit"
        className="h-11 w-11"
      >
        <X className="h-4 w-4" />
      </Button>
      {revisedExpectedStart && (
        <button
          type="button"
          disabled={isSaving}
          className="min-h-11 text-xs text-muted-foreground underline-offset-4 hover:underline disabled:opacity-60"
          onClick={() => void revertToScheduled()}
        >
          Use scheduled time
        </button>
      )}
    </div>
  );
}
