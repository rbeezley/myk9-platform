/**
 * MaxTimeDialog — the judge sets the class's max search time at ringside.
 *
 * AKC leaves some times to the judge (Interior, Exterior, Detective, Handler
 * Discrimination above Novice); since MYK9-1086 a class without one runs with no
 * limit and the scoresheet says so. Saving writes through the class replica, so it
 * applies on this device at once and queues for upload when offline; the upload
 * routes through ringside_update_class, which admits the class's judge and checks
 * the rule range server-side.
 *
 * A multi-area class gets one input per area, each with its own time (MYK9-1098);
 * every area must have a time to save.
 */
import { useEffect, useState } from 'react';
import type React from 'react';
import type { MaxTimeDialogProps } from '@myk9/ringside';
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
import { replicatedClassesTable } from '@/services/replication';
import { handleOpenChange } from './dialogHelpers';
import { AREA_TIME_FIELDS, maxTimeAreaCount, parseMaxTimeInput } from './maxTimeInput';
import { classUsesAreaMaxTimes, maxTimeRangeForClass } from './maxTimeRule';

const MAX_SECONDS = 15 * 60;

/** 150 → "2:30"; no time → "". */
function toMinutesSeconds(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) return '';
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * The host keeps this slot mounted while closed, so the form mounts fresh on every
 * open (and per class): it starts from the class's current time, and an edit
 * abandoned with Cancel is gone.
 */
export const MaxTimeDialog: React.FC<MaxTimeDialogProps> = props =>
  props.isOpen ? <MaxTimeForm key={props.classData.id} {...props} /> : null;

const MaxTimeForm: React.FC<MaxTimeDialogProps> = ({
  onClose,
  showWarning,
  classData,
  onTimeUpdate,
}) => {
  // One input per area only where the scoresheet uses per-area times (AKC).
  const [perArea, setPerArea] = useState(false);
  useEffect(() => {
    let cancelled = false;
    classUsesAreaMaxTimes(classData.id)
      .catch(() => false)
      .then(uses => {
        if (!cancelled) setPerArea(uses);
      });
    return () => {
      cancelled = true;
    };
  }, [classData.id]);
  const areaCount = perArea ? maxTimeAreaCount(classData.area_count) : 1;
  const [allValues, setValues] = useState(() =>
    [
      classData.time_limit_seconds,
      classData.time_limit_area2_seconds,
      classData.time_limit_area3_seconds,
    ]
      .slice(0, maxTimeAreaCount(classData.area_count))
      .map(toMinutesSeconds)
  );
  const values = allValues.slice(0, areaCount);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const seconds = values.map(parseMaxTimeInput);
    const unreadable = seconds.findIndex(s => s === null || s < 1 || s > MAX_SECONDS);
    if (unreadable >= 0) {
      setError(
        `Enter ${areaCount > 1 ? `the Area ${unreadable + 1}` : 'the'} max time in minutes and seconds, like 4:00.`
      );
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const range = await maxTimeRangeForClass(classData.id);
      if (range === 'unknown-offline') {
        setError(
          "You're offline and this class's allowed max time isn't on this device yet. Try again with signal."
        );
        return;
      }
      if (range === 'lookup-failed') {
        setError("Couldn't check this class's allowed max time. Try again.");
        return;
      }
      if (seconds.some(s => s! < range.low || s! > range.high)) {
        setError(
          `Max time for this class must be between ${toMinutesSeconds(range.low)} and ${toMinutesSeconds(range.high)}.`
        );
        return;
      }
      const classIds = [
        classData.id,
        ...(classData.pairedClassId ? [classData.pairedClassId] : []),
      ];
      const updates = Object.fromEntries(
        seconds.map((s, area) => [AREA_TIME_FIELDS[area], s as number])
      );
      for (const classId of classIds) {
        await replicatedClassesTable.updateClass(classId, updates);
      }
      onTimeUpdate?.();
      onClose();
    } catch {
      setError("Couldn't save the max time on this device. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={open => handleOpenChange(open, onClose)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{classData.class_name} — Max Time</DialogTitle>
        </DialogHeader>
        {showWarning && <p>Scoring started without a max time set.</p>}
        <form
          className="space-y-2"
          onSubmit={event => {
            event.preventDefault();
            void save();
          }}
        >
          {values.map((value, area) => (
            <div key={area} className="space-y-1">
              <Label htmlFor={`ringside-max-time-${area + 1}`}>
                {areaCount > 1 ? `Area ${area + 1} max time` : 'Max time'} (minutes:seconds)
              </Label>
              <Input
                id={`ringside-max-time-${area + 1}`}
                inputMode="decimal"
                placeholder="4:00"
                value={value}
                onChange={event =>
                  setValues(current => current.map((v, i) => (i === area ? event.target.value : v)))
                }
                aria-invalid={error ? true : undefined}
                className="h-12 text-lg"
              />
            </div>
          ))}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
