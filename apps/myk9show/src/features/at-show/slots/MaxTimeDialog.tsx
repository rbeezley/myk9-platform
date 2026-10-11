/**
 * MaxTimeDialog — the judge sets the class's max search time at ringside.
 *
 * AKC leaves some times to the judge (Interior, Exterior, Detective, Handler
 * Discrimination above Novice); since MYK9-1086 a class without one runs with no
 * limit and the scoresheet says so. Saving writes through the class replica, so it
 * applies on this device at once and queues for upload when offline; the upload
 * routes through ringside_update_class, which admits the class's judge and checks
 * the rule range server-side.
 */
import { useState } from 'react';
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
import { parseTimeLimitSeconds } from '@/services/mappers/classTimeLimits';
import { handleOpenChange } from './dialogHelpers';

const MAX_SECONDS = 15 * 60;

/** 150 → "2:30"; no time → "". */
function toMinutesSeconds(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) return '';
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export const MaxTimeDialog: React.FC<MaxTimeDialogProps> = ({
  isOpen,
  onClose,
  showWarning,
  classData,
  onTimeUpdate,
}) => {
  const [value, setValue] = useState(() => toMinutesSeconds(classData.time_limit_seconds));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const save = async () => {
    const seconds = parseTimeLimitSeconds(value);
    if (seconds === null || seconds > MAX_SECONDS) {
      setError('Enter the max time in minutes and seconds, like 4:00.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const classIds = [
        classData.id,
        ...(classData.pairedClassId ? [classData.pairedClassId] : []),
      ];
      for (const classId of classIds) {
        await replicatedClassesTable.updateClass(classId, { timeLimitSeconds: seconds });
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
          <Label htmlFor="ringside-max-time">Max time (minutes:seconds)</Label>
          <Input
            id="ringside-max-time"
            inputMode="numeric"
            placeholder="4:00"
            value={value}
            onChange={event => setValue(event.target.value)}
            aria-invalid={error ? true : undefined}
            className="h-12 text-lg"
          />
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
