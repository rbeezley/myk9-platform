/**
 * ClassSettingsDialog -- per-class settings at ringside (MYK9-1626, v3 parity).
 *
 * Planned start time: when the class is planned to start, as ringside sees it. That is
 * the class's Expected start (`revisedExpectedStart`), the same field Status > Start
 * Time sets and the class card, TV and secretary cockpit already read; this sets it
 * without touching the class status. The secretary's schedule (`startTime`) is never
 * written here, and shows only as a hint. Emptying the field clears the revision, so
 * the class reads as running to the schedule again.
 *
 * The write rides the class replica (`updateClass`), so it applies on this device at
 * once and queues offline; the upload routes through ringside_update_class. Who sees
 * the Settings entry is decided upstream (canManageClasses); nothing here widens it.
 * v3's separate time allocation between areas is the per-area Max Time (MYK9-1098).
 */
import { useEffect, useState } from 'react';
import type React from 'react';
import type { ClassSettingsDialogProps } from '@myk9/ringside';
import { Settings } from 'lucide-react';
import { isUnresolvedClockTime } from '@myk9/core';
import { ClockTimeInput } from '@myk9/scoring-ui';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { replicatedClassesTable, replicatedTrialsTable } from '@/services/replication';
import { getTrialTimezone } from '@/features/registries';
import { instantToClockTime, scheduledClockValue } from '@/features/show-map/cockpit/cockpitTime';
import { expectedStartInstant } from '../ringsideCapabilities';
import { ClassDialogShell } from './ClassDialogShell';

interface StartContext {
  /** "HH:MM" of the current Expected start in the trial's zone, '' when none. */
  expected: string;
  /** "HH:MM" of the secretary's scheduled start, '' when none. */
  scheduled: string;
}

async function loadStartContext(classId: string): Promise<StartContext> {
  const cls = await replicatedClassesTable.getClassById(classId);
  const trial = cls?.trialId ? await replicatedTrialsTable.get(cls.trialId) : null;
  return {
    expected: instantToClockTime(cls?.revisedExpectedStart, getTrialTimezone(trial)),
    scheduled: scheduledClockValue(cls?.startTime ?? null),
  };
}

/** The host keeps this slot mounted while closed; the form mounts fresh on every open. */
export const ClassSettingsDialog: React.FC<ClassSettingsDialogProps> = props =>
  props.isOpen ? <ClassSettingsForm key={props.classData.id} {...props} /> : null;

const ClassSettingsForm: React.FC<ClassSettingsDialogProps> = ({
  onClose,
  classData,
  onSettingsUpdate,
}) => {
  const [loaded, setLoaded] = useState<StartContext | null>(null);
  const [time, setTime] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadStartContext(classData.id)
      .then(context => {
        if (!cancelled) setLoaded(context);
      })
      // A failed local read leaves the field blank and still usable.
      .catch(() => {
        if (!cancelled) setLoaded({ expected: '', scheduled: '' });
      });
    return () => {
      cancelled = true;
    };
  }, [classData.id]);

  // What the field shows: the person's edit, else the class's current time.
  const value = touched ? time : (loaded?.expected ?? '');
  const unresolved = isUnresolvedClockTime(value);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await replicatedClassesTable.updateClass(classData.id, {
        revisedExpectedStart: value ? await expectedStartInstant(classData.id, value) : null,
      });
      onSettingsUpdate?.();
      onClose();
    } catch {
      setError("Couldn't save the planned start time on this device. Try again.");
      setSaving(false);
    }
  };

  return (
    <ClassDialogShell
      icon={Settings}
      eyebrow="Settings"
      className={classData.class_name}
      onClose={onClose}
      closeLabel="Cancel"
    >
      <form
        className="flex flex-col gap-2"
        onSubmit={event => {
          event.preventDefault();
          if (!unresolved && loaded) void save();
        }}
      >
        <Label htmlFor="class-settings-planned-start">Planned start time</Label>
        <ClockTimeInput
          id="class-settings-planned-start"
          value={value}
          storage="hhmm"
          disabled={!loaded}
          onChange={next => {
            setTouched(true);
            setTime(next);
          }}
        />
        {loaded?.scheduled && (
          <p className="text-sm text-muted-foreground">
            Scheduled start: {scheduledLabel(loaded.scheduled)}. Leave this empty to follow the
            schedule.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="min-h-11" disabled={saving || !loaded || unresolved}>
          Save
        </Button>
      </form>
    </ClassDialogShell>
  );
};

/** "13:30" as "1:30 PM" for the hint. */
function scheduledLabel(clock: string): string {
  const [h, m] = clock.split(':').map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
