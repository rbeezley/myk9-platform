/**
 * Ringside Requirements (MYK9-1100): the class's rules as judges know them from
 * myK9Q, built from the same cards as the secretary's Class Requirements panel --
 * one component, not a second copy.
 *
 * Works offline: the cards come from the rule values stored on the class (see
 * classRequirementsFromClass), and the full rule replaces them when it loads
 * online. The class's saved max time leads; tapping it opens Set Max Time for
 * those who can set it.
 */
import { useEffect, useState } from 'react';
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
import { useClassRequirements } from '@/hooks/queries/useClassRequirements';
import { replicatedClassesTable } from '@/services/replication';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import { handleOpenChange } from './dialogHelpers';
import { classRequirementsFromClass, setMaxTimeText } from './classRequirementsFromClass';

function useReplicatedClass(classId: string, enabled: boolean): ReplicatedClass | null {
  const [cls, setCls] = useState<ReplicatedClass | null>(null);
  useEffect(() => {
    if (!enabled || !classId) return;
    let cancelled = false;
    replicatedClassesTable
      .getClassById(classId)
      .then(row => {
        if (!cancelled) setCls(row ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [classId, enabled]);
  return cls;
}

export const ClassRequirementsDialog: React.FC<ClassRequirementsDialogProps> = ({
  isOpen,
  onClose,
  onSetMaxTime,
  classData,
}) => {
  const registry = classData.registry ?? null;
  const cls = useReplicatedClass(classData.id, isOpen);
  const { requirements: online } = useClassRequirements({
    organization: registry,
    element: classData.element,
    level: classData.level,
    enabled: isOpen,
  });
  if (!isOpen) return null;

  const requirements = online ?? (cls ? classRequirementsFromClass(cls, registry ?? '') : null);
  const maxTime = (
    <RequirementCard
      icon={<Clock className="h-4 w-4" />}
      colorClass="bg-blue-500/15 text-blue-500"
      label="Max Time (this class)"
      value={setMaxTimeText(cls, !!classData.per_area_times)}
      subtitle={onSetMaxTime ? 'Tap to set' : undefined}
    />
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
        {requirements ? (
          <ClassRequirementsCards
            requirements={requirements}
            className="space-y-3"
            leading={
              onSetMaxTime ? (
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
              )
            }
          />
        ) : (
          <p className="text-sm text-muted-foreground">Loading requirements…</p>
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
