import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RING_ROLES } from '@/types/volunteer';
import type { Volunteer, ClassAssignment } from '@/types/volunteer';
import { VolunteerChip } from './VolunteerChip';
import { AssignVolunteerPopover } from './AssignVolunteerPopover';

interface ClassVolunteerCardProps {
  classId: string;
  className: string;
  classMeta: string;
  assignments: ClassAssignment[];
  volunteers: Volunteer[];
  conflictMap: Map<string, Set<string>>;
  onAssign: (volunteerId: string, classId: string, roleName: string) => void;
  onUnassign: (assignmentId: string) => void;
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
}: ClassVolunteerCardProps) {
  const classConflictIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [volId, classIds] of conflictMap) {
      if (classIds.has(classId)) ids.add(volId);
    }
    return ids;
  }, [conflictMap, classId]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{className}</CardTitle>
        <p className="text-xs text-muted-foreground">{classMeta}</p>
      </CardHeader>
      <CardContent className="space-y-1.5 pt-0">
        {RING_ROLES.map(role => {
          const roleAssignments = assignments.filter(a => a.roleName === role);
          const excludeIds = roleAssignments.map(a => a.volunteerId);

          return (
            <div key={role} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-xs font-medium text-muted-foreground">
                {role}
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {roleAssignments.map(a => (
                  <VolunteerChip
                    key={a.id}
                    name={a.volunteerName}
                    hasConflict={classConflictIds.has(a.volunteerId)}
                    onRemove={() => onUnassign(a.id)}
                  />
                ))}
                <AssignVolunteerPopover
                  volunteers={volunteers}
                  excludeIds={excludeIds}
                  conflictIds={classConflictIds}
                  onAssign={volId => onAssign(volId, classId, role)}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
