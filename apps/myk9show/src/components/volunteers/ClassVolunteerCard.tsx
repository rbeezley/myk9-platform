import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Volunteer, ClassAssignment } from '@/types/volunteer';
import { ClassRingRoles } from './ClassRingRoles';
import { classConflictIds } from './classConflictIds';

interface ClassVolunteerCardProps {
  classId: string;
  className: string;
  classMeta: string;
  assignments: ClassAssignment[];
  volunteers: Volunteer[];
  conflictMap: Map<string, Set<string>>;
  onAssign: (volunteerId: string, classId: string, roleName: string) => void;
  onUnassign: (assignmentId: string) => void;
  onAddAndAssign?: ((name: string, classId: string, roleName: string) => void) | undefined;
}

export function ClassVolunteerCard({
  classId,
  className,
  classMeta,
  assignments,
  volunteers,
  conflictMap,
  onAssign,
  onUnassign,
  onAddAndAssign,
}: ClassVolunteerCardProps) {
  const conflictIds = useMemo(() => classConflictIds(conflictMap, classId), [conflictMap, classId]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{className}</CardTitle>
        <p className="text-xs text-muted-foreground">{classMeta}</p>
      </CardHeader>
      <CardContent className="pt-0">
        <ClassRingRoles
          classId={classId}
          assignments={assignments}
          volunteers={volunteers}
          conflictIds={conflictIds}
          onAssign={onAssign}
          onUnassign={onUnassign}
          onAddAndAssign={onAddAndAssign}
        />
      </CardContent>
    </Card>
  );
}
