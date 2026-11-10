import { useEffect, useState } from 'react';
import { Check, Clock3, X } from 'lucide-react';
import { CLASS_STATUS, isUnresolvedClockTime, type ClassStatusValue } from '@myk9/core';
import { ClockTimeInput } from '@myk9/scoring-ui';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { applyManualClassStatus } from '@/services/show-day/classStatusMutations';
import { setRevisedExpectedStart } from '@/services/show-day/classTimingMutations';
import { cn } from '@/lib/utils';

import { clockTimeToInstant, instantToClockTime, scheduledClockValue } from './cockpitTime';
import type { CockpitLifecycle } from './secretaryCockpitTypes';

const STATUS_OPTIONS: readonly { value: ClassStatusValue; label: string }[] = [
  { value: CLASS_STATUS.SCHEDULED, label: 'Not started' },
  { value: CLASS_STATUS.IN_PROGRESS, label: 'In progress' },
  { value: CLASS_STATUS.COMPLETED, label: 'Complete' },
  { value: CLASS_STATUS.CANCELLED, label: 'Cancelled' },
];

export const STATUS_TIMING_HELP =
  'Ringside scoring fills in the start and finish times until you change the status here. After that, In progress records the start time if there isn’t one yet, and Complete records the finish time.';

export const STATUS_LABEL: Record<CockpitLifecycle, string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  complete: 'Complete',
  cancelled: 'Cancelled',
};

/**
 * The one status-change path: the "Complete over unentered scores" and "Cancel this class" confirmations, and the write.
 * The class header's Actions menu uses it too, rendering `confirmDialog` outside the menu so the
 * confirmation outlives the menu closing.
 */
export function useClassStatusChange({
  classId,
  className,
  unenteredScoreCount = 0,
}: {
  classId: string;
  /** Named in the Cancelled question; "this class" when the caller has no name. */
  className?: string | undefined;
  /**
   * How many scores are still unentered, or `null` when that is UNKNOWN because the entries read
   * did not succeed. Null must not collapse to 0: this guard exists to stop a class being marked
   * complete over unentered paper scores, and skipping the confirmation when the count is
   * unknowable turns "I don't know whether scores are outstanding" into "there are none".
   */
  unenteredScoreCount?: number | null;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [pending, setPending] = useState<
    { kind: 'complete'; warning: string } | { kind: 'cancel' } | null
  >(null);
  // `pending` outlives `confirmOpen` so the copy holds steady while the popup fades out.
  const [confirmOpen, setConfirmOpen] = useState(false);

  const applyStatus = async (status: ClassStatusValue) => {
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

  const update = (status: ClassStatusValue) => {
    const scoresUnknown = unenteredScoreCount === null;
    const outstanding = unenteredScoreCount ?? 0;
    if (status === CLASS_STATUS.COMPLETED && (scoresUnknown || outstanding > 0)) {
      setPending({
        kind: 'complete',
        warning: scoresUnknown
          ? 'Entry data is unavailable, so we cannot tell whether paper scores still need entry. Mark this Class complete anyway?'
          : `${outstanding} paper ${outstanding === 1 ? 'score still needs' : 'scores still need'} entry. Mark this Class complete anyway?`,
      });
      setConfirmOpen(true);
      return;
    }
    // Cancelled tells ringside and exhibitors the class is off, so it asks first.
    if (status === CLASS_STATUS.CANCELLED) {
      setPending({ kind: 'cancel' });
      setConfirmOpen(true);
      return;
    }
    void applyStatus(status);
  };

  const confirmDialog = (
    <ConfirmDialog
      open={confirmOpen}
      onOpenChange={setConfirmOpen}
      title={pending?.kind === 'cancel' ? 'Cancel this class?' : 'Mark this Class complete?'}
      description={
        pending?.kind === 'cancel'
          ? `${className || 'This class'} will show as cancelled on the show schedule and will stop taking entries. Ringside screens will not show the change. You can change the status back later.`
          : pending?.warning
      }
      confirmLabel={pending?.kind === 'cancel' ? 'Cancel class' : 'Mark complete'}
      cancelLabel={pending?.kind === 'cancel' ? 'Keep class' : 'Cancel'}
      destructive={pending?.kind === 'cancel'}
      onConfirm={() =>
        void applyStatus(
          pending?.kind === 'cancel' ? CLASS_STATUS.CANCELLED : CLASS_STATUS.COMPLETED
        )
      }
    />
  );

  return { update, isSaving, confirmDialog };
}

/** The status choices (help text, routine statuses, then Cancelled), for the Actions menu's status submenu. */
export function ClassStatusChoices({
  label,
  onSelect,
}: {
  /** The current status label; that choice is shown ticked and disabled. */
  label: string;
  onSelect: (status: ClassStatusValue) => void;
}) {
  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel className="max-w-72 text-xs font-normal text-muted-foreground">
          {STATUS_TIMING_HELP}
        </DropdownMenuLabel>
        {STATUS_OPTIONS.filter(option => option.value !== CLASS_STATUS.CANCELLED).map(option => (
          <DropdownMenuItem
            key={option.value}
            disabled={option.label === label}
            onClick={() => onSelect(option.value)}
          >
            {option.label}
            {option.label === label && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        disabled={label === 'Cancelled'}
        className="text-destructive focus:text-destructive"
        onClick={() => onSelect(CLASS_STATUS.CANCELLED)}
      >
        Cancelled
        {label === 'Cancelled' && <Check className="ml-auto h-4 w-4" />}
      </DropdownMenuItem>
    </>
  );
}

/** The class's status as a read-only badge; changing it goes through the header's Actions menu. */
export function ClassStatusControl({ lifecycle }: { lifecycle: CockpitLifecycle | null }) {
  const label = lifecycle ? STATUS_LABEL[lifecycle] : 'Status unknown';
  const tone =
    lifecycle === 'complete'
      ? 'border-success/30 bg-success/10 text-success'
      : lifecycle === 'in-progress'
        ? 'border-warning/30 bg-warning/10 text-warning'
        : lifecycle === 'cancelled'
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : 'border-border bg-muted text-foreground';

  return (
    <span className={cn('rounded-full border px-2.5 py-1 text-xs font-semibold', tone)}>
      {label}
    </span>
  );
}

export function ExpectedStartControl({
  classId,
  scheduledStart,
  revisedExpectedStart,
  trialDate,
  timeZone,
  canManageShow,
  editing,
  onEditingChange,
}: {
  classId: string;
  scheduledStart: string | null;
  revisedExpectedStart: string | null;
  trialDate: string;
  timeZone: string;
  canManageShow: boolean;
  /**
   * Controlled by the class header's Actions menu, which opens this editor in a dialog. Without
   * `onEditingChange` (or without `canManageShow`) this renders the read-only value.
   */
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
}) {
  const effective =
    instantToClockTime(revisedExpectedStart, timeZone) || scheduledClockValue(scheduledStart);
  const [value, setValue] = useState(effective);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => setValue(effective), [effective]);

  if (onEditingChange !== undefined && !editing) return null;
  if (!canManageShow && !effective) {
    return (
      <span className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted-foreground">
        <Clock3 className="h-4 w-4" />
        Not set
      </span>
    );
  }
  if (!canManageShow || onEditingChange === undefined) {
    return (
      <button
        type="button"
        disabled
        className="group inline-flex min-h-11 items-center gap-1.5 text-left text-sm font-semibold text-foreground disabled:cursor-default"
      >
        <Clock3 className="h-4 w-4 text-muted-foreground" />
        {effective || 'Set expected start'}
      </button>
    );
  }
  const setIsEditing = onEditingChange;

  const unresolved = isUnresolvedClockTime(value);

  const save = async () => {
    if (!value || unresolved) return;
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
    <div className="flex flex-wrap items-start gap-1.5">
      <div className="flex min-w-0 max-w-full flex-wrap items-start gap-1.5">
        <ClockTimeInput
          value={value}
          storage="hhmm"
          onChange={setValue}
          ariaLabel="Revised expected start"
          onSubmit={() => void save()}
          onCancel={() => setIsEditing(false)}
          disabled={isSaving}
        />
        <div className="flex shrink-0 items-start gap-2" data-testid="clock-time-actions">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => void save()}
            disabled={!value || unresolved || isSaving}
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
        </div>
      </div>
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
