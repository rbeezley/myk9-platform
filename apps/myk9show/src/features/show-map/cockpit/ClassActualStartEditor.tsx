/**
 * Edit or clear a class's actual start time from the secretary cockpit
 * (MYK9-1086). The start is stamped automatically when a class is set to In
 * progress; a wrong or premature stamp previously had no way back short of
 * resetting the whole class to not-started.
 *
 * The secretary types a clock time in the trial's own time zone, on the
 * trial's date. Writes go through the replicated classes table, so the edit
 * queues offline like every other show-day change.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TimeOfDayInput } from '@/components/common/TimeOfDayInput';
import { clockOnDateToIso } from '@/components/trials/trialDateTime';
import { replicatedClassesTable } from '@/services/replication';

export function ClassActualStartEditor({
  classId,
  className,
  trialDate,
  timeZone,
  hasStart,
}: {
  classId: string;
  className: string;
  trialDate: string;
  timeZone: string;
  hasStart: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const write = async (actualStart: string | undefined) => {
    setSaving(true);
    setError(null);
    try {
      await replicatedClassesTable.updateClass(classId, { actual_start_time: actualStart });
      setEditing(false);
      setDraft('');
    } catch {
      setError('Could not save the start time. Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <span className="ml-2 inline-flex gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs"
          onClick={() => setEditing(true)}
          aria-label={`${hasStart ? 'Edit' : 'Set'} start time for ${className}`}
        >
          {hasStart ? 'Edit start' : 'Set start'}
        </Button>
        {hasStart && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            disabled={saving}
            onClick={() => void write(undefined)}
            aria-label={`Clear start time for ${className}`}
          >
            Clear start
          </Button>
        )}
      </span>
    );
  }

  const save = () => {
    const iso = clockOnDateToIso(trialDate, draft, timeZone);
    if (!iso) {
      setError('Enter a time like 9:42 AM.');
      return;
    }
    void write(iso);
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <TimeOfDayInput
        id={`class-start-${classId}`}
        aria-label={`Start time for ${className}`}
        value={draft}
        onChange={value => {
          setDraft(value);
          setError(null);
        }}
        className="h-9 w-32"
      />
      <Button type="button" size="sm" className="h-9" disabled={saving} onClick={save}>
        Save
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-9"
        onClick={() => {
          setEditing(false);
          setError(null);
        }}
      >
        Cancel
      </Button>
      {error && (
        <p role="alert" className="w-full text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
