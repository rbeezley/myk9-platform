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
 * every area must have a time to save. Before the judge types, the dialog shows the
 * allowed range with 30-second quick picks, and a time the rulebook fixes is shown
 * read-only rather than asked for (MYK9-1101, both from myK9Q).
 */
import { useState } from 'react';
import type React from 'react';
import type { MaxTimeDialogProps } from '@myk9/ringside';
import { DurationInput } from '@myk9/scoring-ui';
import { isDurationFailure, parseDuration } from '@myk9/core';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { replicatedClassesTable } from '@/services/replication';
import { handleOpenChange } from './dialogHelpers';
import { AREA_TIME_FIELDS, maxTimeAreaCount, toMinutesSeconds } from './maxTimeInput';
import { maxTimeRangeForClass, useMaxTimeRange } from './maxTimeRule';
import { MaxTimeQuickPicks } from './MaxTimeQuickPicks';

const MAX_SECONDS = 15 * 60;

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
  // One input per area only where the scoresheet times each area (AKC Scent Work).
  const areaCount = classData.per_area_times ? maxTimeAreaCount(classData.area_count) : 1;
  // An area with no time of its own starts at area 1's: that is the time the
  // scoresheet and Requirements already use for it.
  const [values, setValues] = useState(() =>
    [
      classData.time_limit_seconds,
      classData.time_limit_area2_seconds,
      classData.time_limit_area3_seconds,
    ]
      .slice(0, areaCount)
      .map(seconds => toMinutesSeconds(seconds || classData.time_limit_seconds))
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [focusedArea, setFocusedArea] = useState(0);
  const loadedRange = useMaxTimeRange(classData.id);
  const known = typeof loadedRange === 'object' && loadedRange !== null ? loadedRange : null;
  const fixedTime = known?.fixed;
  const setAreaValue = (area: number, value: string) =>
    setValues(current => current.map((v, i) => (i === area ? value : v)));

  /** The class fields to write, or null after showing why the entry can't be saved. */
  const checkedUpdates = async (): Promise<Record<string, number> | null> => {
    // The class's CURRENT rule decides, not the one loaded when the dialog opened:
    // a synced element or level change must not save an obsolete time.
    const range = await maxTimeRangeForClass(classData.id);
    if (range === 'unknown-offline') {
      setError(
        "You're offline and this class's allowed max time isn't on this device yet. Try again with signal."
      );
      return null;
    }
    if (range === 'lookup-failed') {
      setError("Couldn't check this class's allowed max time. Try again.");
      return null;
    }
    // A rulebook time is applied as it stands: area 1 carries it, and any other
    // area falls back to area 1 on the scoresheet.
    if (range.fixed) return { [AREA_TIME_FIELDS[0]]: range.fixed };
    const parsed = values.map(value => parseDuration(value, 'max'));
    const unreadable = parsed.findIndex(
      p => isDurationFailure(p) || p.seconds < 1 || p.seconds > MAX_SECONDS
    );
    if (unreadable >= 0) {
      const which = areaCount > 1 ? `the Area ${unreadable + 1}` : 'the';
      setError(`Enter ${which} max time in minutes and seconds, like 4:00.`);
      return null;
    }
    const seconds = parsed.map(p => (p.ok ? p.seconds : 0));
    if (seconds.some(s => s < range.low || s > range.high)) {
      setError(
        `Max time for this class must be between ${toMinutesSeconds(range.low)} and ${toMinutesSeconds(range.high)}.`
      );
      return null;
    }
    return Object.fromEntries(seconds.map((s, area) => [AREA_TIME_FIELDS[area], s]));
  };

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      const updates = await checkedUpdates();
      if (!updates) return;
      const classIds = [
        classData.id,
        ...(classData.pairedClassId ? [classData.pairedClassId] : []),
      ];
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
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <span className="block">{classData.class_name}</span>
            <span className="block">Max Time</span>
          </DialogTitle>
        </DialogHeader>
        {showWarning && (
          <p role="status" className="text-sm font-medium text-destructive">
            Max time required before scoring.
          </p>
        )}
        <form
          className="space-y-2"
          onSubmit={event => {
            event.preventDefault();
            void save();
          }}
        >
          {fixedTime ? (
            <p className="text-base">
              Set by the rulebook: <strong>{toMinutesSeconds(fixedTime)}</strong>
            </p>
          ) : (
            <>
              {values.map((value, area) => (
                <div key={area} className="space-y-1">
                  <Label htmlFor={`ringside-max-time-${area + 1}`}>
                    {areaCount > 1 ? `Area ${area + 1} max time` : 'Max time'} (minutes:seconds)
                  </Label>
                  <DurationInput
                    kind="max"
                    id={`ringside-max-time-${area + 1}`}
                    value={value}
                    range={known?.judgeSet ? { low: known.low, high: known.high } : undefined}
                    onFocus={() => setFocusedArea(area)}
                    onChange={next => setAreaValue(area, next)}
                    className="h-12 rounded-md border border-input bg-background px-3 text-center text-lg"
                  />
                </div>
              ))}
              {known?.judgeSet && (
                <MaxTimeQuickPicks
                  low={known.low}
                  high={known.high}
                  onPick={seconds => setAreaValue(focusedArea, toMinutesSeconds(seconds))}
                />
              )}
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            {/* Wait for the rule: a rulebook-time class must not save a typed time. */}
            <Button type="submit" disabled={saving || loadedRange === null}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
