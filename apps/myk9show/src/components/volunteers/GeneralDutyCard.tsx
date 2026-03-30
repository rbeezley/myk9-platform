import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Volunteer, GeneralAssignment } from '@/types/volunteer';
import { VolunteerChip } from './VolunteerChip';
import { AssignVolunteerPopover } from './AssignVolunteerPopover';

interface GeneralDutyCardProps {
  roleName: string;
  assignments: GeneralAssignment[];
  volunteers: Volunteer[];
  onAssign: (volunteerId: string) => void;
  onUnassign: (assignmentId: string) => void;
}

export function GeneralDutyCard({
  roleName,
  assignments,
  volunteers,
  onAssign,
  onUnassign,
}: GeneralDutyCardProps) {
  const excludeIds = assignments.map(a => a.volunteerId);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{roleName}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-1 pt-0">
        {assignments.map(a => (
          <VolunteerChip key={a.id} name={a.volunteerName} onRemove={() => onUnassign(a.id)} />
        ))}
        <AssignVolunteerPopover
          volunteers={volunteers}
          excludeIds={excludeIds}
          conflictIds={new Set()}
          onAssign={onAssign}
        />
      </CardContent>
    </Card>
  );
}
