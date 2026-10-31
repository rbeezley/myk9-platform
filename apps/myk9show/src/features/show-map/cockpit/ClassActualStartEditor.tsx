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
import { ClockTimeInput } from '@myk9/scoring-ui';
import { clockOnDateToIso, hasTrialTime } from '@/components/trials/trialDateTime';
import { replicatedClassesTable } from '@/services/replication';

interface ClassActualStartEditorProps {
  classId: string;
  className: string;
  trialDate: string;
  timeZone: string;
  hasStart: boolean;
}

/**
 * Keyed by class so the focused-class panel, which reuses one instance as the
 * secretary moves between classes, never carries a draft or an error from one
 * class onto the next.
 */
export function ClassActualStartEditor(props: ClassActualStartEditorProps) {
  return <ClassActualStartEditorForm key={props.classId} {...props} />;
}

function ClassActualStartEditorForm({
  classId,
  className,
  trialDate,
  timeZone,
  hasStart,
}: ClassActualStartEditorProps) {
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
      <span className="ml-2 inline-flex flex-wrap items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="touch"
          className="px-2 text-xs"
          disabled={saving}
          onClick={() => {
            setError(null);
            setEditing(true);
          }}
          aria-label={`${hasStart ? 'Edit' : 'Set'} start time for ${className}`}
        >
          {hasStart ? 'Edit start' : 'Set start'}
        </Button>
        {hasStart && (
          <Button
            type="button"
            variant="ghost"
            size="touch"
            className="px-2 text-xs"
            disabled={saving}
            onClick={() => void write(undefined)}
            aria-label={`Clear start time for ${className}`}
          >
            Clear start
          </Button>
        )}
        {error && (
          <p role="alert" className="w-full text-xs text-destructive">
            {error}
          </p>
        )}
      </span>
    );
  }

  const save = () => {
    const iso = hasTrialTime(draft) ? clockOnDateToIso(trialDate, draft, timeZone) : null;
    if (!iso) {
      setError('Enter a time like 9:42 AM.');
      return;
    }
    void write(iso);
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <div className="w-36">
        <ClockTimeInput
          id={`class-start-${classId}`}
          ariaLabel={`Start time for ${className}`}
          value={draft}
          onChange={value => {
            setDraft(value);
            setError(null);
          }}
          onSubmit={save}
          onCancel={() => {
            setEditing(false);
            setError(null);
          }}
        />
      </div>
      <Button type="button" size="touch" disabled={saving} onClick={save}>
        Save
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="touch"
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
