/**
 * Edit or clear a class's actual start time from the secretary cockpit
 * (MYK9-1086). Mounted once, under the class step bar (MYK9-1783): the Class
 * started step opens it. The start is stamped automatically when a class is set to In
 * progress; a wrong or premature stamp previously had no way back short of
 * resetting the whole class to not-started.
 *
 * The secretary types a clock time in the trial's own time zone, on the
 * trial's date. Writes go through the replicated classes table, so the edit
 * queues offline like every other show-day change.
 */
import { useEffect, useRef, useState } from 'react';
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
  /** The step bar opens the editor from outside; it closes through `onOpenChange(false)`. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  open,
  onOpenChange,
}: ClassActualStartEditorProps) {
  const editing = open;
  const setEditing = onOpenChange;
  const formRef = useRef<HTMLDivElement>(null);
  // Opening moves the eyes and the keyboard to the time field (the input takes focus itself).
  useEffect(() => {
    if (editing) formRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [editing]);
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

  if (!editing) return null;

  const save = () => {
    const iso = hasTrialTime(draft) ? clockOnDateToIso(trialDate, draft, timeZone) : null;
    if (!iso) {
      setError('Enter a time like 9:42 AM.');
      return;
    }
    void write(iso);
  };

  return (
    <div ref={formRef} className="mt-2 flex flex-wrap items-start gap-2">
      <div
        className="flex min-w-0 max-w-full flex-wrap items-start gap-2"
        data-testid="class-start-row"
      >
        <ClockTimeInput
          autoFocus
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
        <div className="flex shrink-0 items-start gap-2" data-testid="clock-time-actions">
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
        </div>
      </div>
      {hasStart && (
        <Button
          type="button"
          variant="ghost"
          size="touch"
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
    </div>
  );
}
