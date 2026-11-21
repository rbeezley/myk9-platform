import { RING_ROLES } from '@/types/volunteer';
import type { Volunteer, ClassAssignment } from '@/types/volunteer';
import { VolunteerChip } from './VolunteerChip';
import { AssignVolunteerPopover } from './AssignVolunteerPopover';

interface ClassRingRolesProps {
  classId: string;
  /** This class's assignments only. */
  assignments: ClassAssignment[];
  volunteers: Volunteer[];
  /** Volunteers who handle a dog in this class. */
  conflictIds: Set<string>;
  onAssign: (volunteerId: string, classId: string, roleName: string) => void;
  onUnassign: (assignmentId: string) => void;
}

/**
 * One class's four ring jobs, each with its people and a picker. Shared by the Volunteers page's
 * class card and Show Desk's class panel (MYK9-2328), so both read and write the same
 * `volunteer_class_assignments` rows.
 */
export function ClassRingRoles({
  classId,
  assignments,
  volunteers,
  conflictIds,
  onAssign,
  onUnassign,
}: ClassRingRolesProps) {
  return (
    <div className="space-y-1.5">
      {RING_ROLES.map(role => {
        const roleAssignments = assignments.filter(a => a.roleName === role);
        const excludeIds = roleAssignments.map(a => a.volunteerId);

        return (
          <div key={role} className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-xs font-medium text-muted-foreground">{role}</span>
            <div className="flex flex-wrap items-center gap-1">
              {roleAssignments.map(a => (
                <VolunteerChip
                  key={a.id}
                  name={a.volunteerName}
                  hasConflict={conflictIds.has(a.volunteerId)}
                  onRemove={() => onUnassign(a.id)}
                />
              ))}
              <AssignVolunteerPopover
                volunteers={volunteers}
                excludeIds={excludeIds}
                conflictIds={conflictIds}
                roleLabel={role}
                onAssign={volId => onAssign(volId, classId, role)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
