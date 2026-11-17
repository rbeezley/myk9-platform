/**
 * Ringside Requirements (MYK9-1100): the class's rules as judges know them from
 * myK9Q, built from the same cards as the secretary's Class Requirements panel --
 * one component, not a second copy.
 *
 * Works offline: the cards come from the class's rule as cached on it at sync
 * (see classRequirementsFromClass), read live from the replica. The class's
 * saved max time leads, with when it was set; tapping it opens Set Max Time for those who can
 * set it. Without `onSetMaxTime` it is the read-only view exhibitors get from Ringside's class
 * card and My Shows (MYK9-2137): one view, two doors.
 */
import type React from 'react';
import type { ClassRequirementsDialogProps } from '@myk9/ringside';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useLiveClasses } from '../useLiveClasses';
import { handleOpenChange } from './dialogHelpers';
import { ClassRequirementsContent } from './ClassRequirementsContent';
import { useClassRegistryId } from './useClassRegistryId';

export const ClassRequirementsDialog: React.FC<
  ClassRequirementsDialogProps & {
    /** The show's zone, for when the max time was set. */
    timeZone?: string | undefined;
    /** False where the entry count is not known (My Shows). */
    showEntryCount?: boolean | undefined;
    /** My Shows: no Ringside lookup tells it, so per-area times follow the class's own area count. */
    perAreaFromClass?: boolean | undefined;
  }
> = ({
  isOpen,
  onClose,
  onSetMaxTime,
  classData,
  timeZone,
  showEntryCount = true,
  perAreaFromClass = false,
}) => {
  // Live: a max time saved on another device shows without reopening.
  const live = useLiveClasses(classData.id ? [classData.id] : [], isOpen);
  const cls = live?.[0] ?? null;
  const registry = useClassRegistryId(cls?.trialId, classData.registry, isOpen);
  if (!isOpen) return null;
  const subtitle = [
    `${cls?.element ?? classData.element} ${cls?.level ?? classData.level}`.trim(),
    showEntryCount
      ? `${classData.entry_count} ${classData.entry_count === 1 ? 'entry' : 'entries'}`
      : '',
  ]
    .filter(Boolean)
    .join(' · ');
  // A finished read that found no class (or a list with no single class) is not
  // loading: say so, and keep Set Max Time reachable.
  const loading = !!classData.id && live === null;

  return (
    <Dialog open onOpenChange={open => handleOpenChange(open, onClose)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <span className="block">{classData.class_name}</span>
            <span className="block">Requirements</span>
          </DialogTitle>
        </DialogHeader>
        {subtitle && <p>{subtitle}</p>}
        <ClassRequirementsContent
          cls={cls}
          loading={loading}
          registry={registry}
          perAreaTimes={
            classData.per_area_times ?? (perAreaFromClass ? (cls?.areaCount ?? 1) > 1 : false)
          }
          timeZone={timeZone}
          onSetMaxTime={onSetMaxTime}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
