import { useEffect, useId, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { replicatedClassesTable } from '@/services/replication';
import { queryClient } from '@/lib/queryClient';
import { classKeys } from '@/hooks/queries/useClassesDatabase';
import { notifications } from '@/lib/notifications';
import { cn } from '@/lib/utils';
import { formatStartTime } from './schedule-timeline.utils';
import type { LevelDetail } from './schedule-timeline.types';

interface ClassStartTimeEditorProps {
  classId: string;
  /** Raw start_time value for this class (time-only or ISO), as stored/read via the replicated classes table. */
  startTime: string | null;
  showId: string;
  trialId: string;
  judgeId?: string | null | undefined;
  judgeName?: string | null | undefined;
  /** Every level in the trial, used to prevent double-booking one judge. */
  trialLevels?: readonly Pick<
    LevelDetail,
    'classId' | 'className' | 'startTime' | 'judgeId' | 'judgeName'
  >[];
  /** Shown before the time when an element aggregates more than one level (e.g. "Novice"). */
  label?: string | undefined;
  className?: string | undefined;
}

/** Converts a stored start_time value ("09:00:00", ISO timestamp) to an `<input type="time">` value ("09:00"). */
function toTimeInputValue(startTime: string | null): string {
  if (!startTime) return '';
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(startTime)) return startTime.slice(0, 5);
  if (startTime.includes('T')) {
    const d = new Date(startTime);
    if (!isNaN(d.getTime())) return d.toTimeString().slice(0, 5);
  }
  return '';
}

/**
 * Inline start-time editor for a single class, used on the Setup tab schedule.
 *
 * Renders as plain text with a pencil affordance when idle; switches to an
 * `<input type="time">` with explicit Save/Cancel on click. Writes through
 * `replicatedClassesTable` (IndexedDB-first, offline-safe) so the value stays
 * consistent with every other class/trial/show-day surface that reads class
 * start times.
 */
export function ClassStartTimeEditor({
  classId,
  startTime,
  showId,
  trialId,
  judgeId,
  judgeName,
  trialLevels = [],
  label,
  className,
}: ClassStartTimeEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [savedStartTime, setSavedStartTime] = useState(startTime);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const inputId = useId();

  useEffect(() => {
    setSavedStartTime(startTime);
  }, [startTime]);

  const displayTime = formatStartTime(savedStartTime) ?? 'TBD';

  function openEditor() {
    setDraft(toTimeInputValue(savedStartTime));
    setError(null);
    setIsEditing(true);
  }

  function cancelEditing() {
    setIsEditing(false);
    setError(null);
  }

  async function save() {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft)) {
      setError('Enter a valid time, like 9:00 AM.');
      return;
    }

    const conflict = judgeId
      ? trialLevels.find(
          level =>
            level.classId !== classId &&
            level.judgeId === judgeId &&
            toTimeInputValue(level.startTime) === draft
        )
      : undefined;
    if (conflict) {
      const formattedTime = formatStartTime(`${draft}:00`) ?? draft;
      setError(
        `${judgeName ?? conflict.judgeName ?? 'This judge'} is already assigned to ${conflict.className} at ${formattedTime}. Choose another time.`
      );
      return;
    }
    setIsSaving(true);
    setError(null);
    const nextStartTime = `${draft}:00`;
    try {
      await replicatedClassesTable.updateClass(classId, { startTime: nextStartTime });
      setSavedStartTime(nextStartTime);
      setIsEditing(false);
      notifications.success(`Start time set to ${formatStartTime(nextStartTime)}`);
      queryClient.invalidateQueries({ queryKey: ['shows', showId, 'schedule-timeline'] });
      queryClient.invalidateQueries({ queryKey: classKeys.detail(classId) });
      queryClient.invalidateQueries({ queryKey: classKeys.byTrial(trialId) });
      queryClient.invalidateQueries({ queryKey: classKeys.lists() });
    } catch (err) {
      console.error('[ClassStartTimeEditor] failed to save start time', err);
      setError("Couldn't save that time. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void save();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEditing();
    }
  }

  if (isEditing) {
    return (
      <div className={cn('flex flex-wrap items-center gap-1.5 py-0.5', className)}>
        {label && <span className="text-xs text-muted-foreground">{label}</span>}
        <Input
          id={inputId}
          type="time"
          value={draft}
          onChange={e => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          autoFocus
          disabled={isSaving}
          aria-label={label ? `Start time for ${label}` : 'Start time'}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className="h-11 w-[7.5rem] text-xs"
        />
        <Button
          type="button"
          size="icon-lg"
          variant="ghost"
          className="shrink-0"
          onClick={() => void save()}
          disabled={isSaving}
          aria-label="Save start time"
        >
          <Check className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon-lg"
          variant="ghost"
          className="shrink-0"
          onClick={cancelEditing}
          disabled={isSaving}
          aria-label="Cancel editing start time"
        >
          <X className="h-4 w-4" />
        </Button>
        {error && (
          <span id={`${inputId}-error`} role="alert" className="w-full text-xs text-destructive">
            {error}
          </span>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={openEditor}
      className={cn(
        'flex min-h-[2.75rem] items-center gap-1 rounded-sm px-1 text-xs text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
      aria-label={label ? `Edit start time for ${label}` : 'Edit start time'}
    >
      {label && <span>{label}:</span>}
      <span>{displayTime}</span>
      <Pencil className="h-3 w-3 shrink-0" aria-hidden="true" />
    </button>
  );
}
