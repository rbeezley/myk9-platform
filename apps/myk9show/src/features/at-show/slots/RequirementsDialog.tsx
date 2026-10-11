/**
 * Ringside Requirements (MYK9-1100): the class's rules as judges know them from
 * myK9Q, built from the same cards as the secretary's Class Requirements panel --
 * one component, not a second copy.
 *
 * Works offline: the cards come from the class's rule as cached on it at sync
 * (see classRequirementsFromClass), read live from the replica. The class's
 * saved max time leads; tapping it opens Set Max Time for those who can set it.
 */
import type React from 'react';
import { Clock } from 'lucide-react';
import type { ClassRequirementsDialogProps } from '@myk9/ringside';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  ClassRequirementsCards,
  RequirementCard,
} from '@/components/classes/ClassRequirementsPanel';
import { useLiveClasses } from '../useLiveClasses';
import { handleOpenChange } from './dialogHelpers';
import { classRequirementsFromClass, setMaxTimeText } from './classRequirementsFromClass';

export const ClassRequirementsDialog: React.FC<ClassRequirementsDialogProps> = ({
  isOpen,
  onClose,
  onSetMaxTime,
  classData,
}) => {
  // Live: a max time saved on another device shows without reopening.
  const live = useLiveClasses(classData.id ? [classData.id] : [], isOpen);
  if (!isOpen) return null;
  const cls = live?.[0] ?? null;
  // A finished read that found no class (or a list with no single class) is not
  // loading: say so, and keep Set Max Time reachable.
  const loading = !!classData.id && live === null;

  const requirements = cls ? classRequirementsFromClass(cls, classData.registry ?? '') : null;
  const maxTime = (
    <RequirementCard
      icon={<Clock className="h-4 w-4" />}
      colorClass="bg-blue-500/15 text-blue-500"
      label="Max Time (this class)"
      value={setMaxTimeText(cls, !!classData.per_area_times)}
      subtitle={onSetMaxTime ? 'Tap to set' : undefined}
    />
  );
  const maxTimeCard = onSetMaxTime ? (
    <button
      type="button"
      className="block w-full text-left"
      onClick={onSetMaxTime}
      aria-label="Set Max Time"
    >
      {maxTime}
    </button>
  ) : (
    maxTime
  );

  return (
    <Dialog open onOpenChange={open => handleOpenChange(open, onClose)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{classData.class_name} — Requirements</DialogTitle>
        </DialogHeader>
        <p>
          {classData.element} {classData.level} · {classData.entry_count} entries
        </p>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading requirements…</p>
        ) : requirements ? (
          <ClassRequirementsCards
            requirements={requirements}
            className="space-y-3"
            leading={maxTimeCard}
          />
        ) : (
          <div className="space-y-3">
            {maxTimeCard}
            <p className="text-sm text-muted-foreground">
              This class&apos;s rules aren&apos;t on this device yet. They load on the next sync.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
