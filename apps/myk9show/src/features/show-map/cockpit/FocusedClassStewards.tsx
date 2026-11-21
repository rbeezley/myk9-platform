import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ClassRingRoles } from '@/components/volunteers/ClassRingRoles';
import { classConflictIds } from '@/components/volunteers/classConflictIds';
import { volunteersPagePath } from '@/components/volunteers/volunteersPagePath';
import { useClassStewards } from '@/hooks/queries/useClassStewards';

/**
 * The class panel's Stewards setting (MYK9-2328): the class's four ring jobs from the show's
 * volunteer list, beside the Judge. It is the Volunteers page's class card in place, on the same
 * rows. Assigning a steward plans who works the class; it does not change their ringside access,
 * which stays show-wide so stewards can move where they are needed (owner, 2026-11-21).
 */
export function FocusedClassStewards({ showId, classId }: { showId: string; classId: string }) {
  const stewards = useClassStewards(showId);
  const conflictIds = useMemo(
    () => classConflictIds(stewards.conflictMap, classId),
    [stewards.conflictMap, classId]
  );
  const volunteersLink = (
    <Link
      to={volunteersPagePath(showId)}
      className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
    >
      All volunteers
    </Link>
  );

  // The volunteer list is an online read, like the Volunteers page.
  if (stewards.status !== 'ready') {
    return (
      <p className="text-xs text-muted-foreground">
        {stewards.status === 'loading'
          ? 'Loading stewards…'
          : "We couldn't load the stewards. Try again when you're back online."}
      </p>
    );
  }

  // Volunteers are added on the Volunteers page; the panel only picks from that list.
  if (stewards.volunteers.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No volunteers yet.{' '}
        <Link to={volunteersPagePath(showId)} className="underline underline-offset-4">
          Add them on the Volunteers page
        </Link>
        .
      </p>
    );
  }

  const assignments = stewards.assignmentsByClass.get(classId) ?? [];
  return (
    <div className="space-y-1.5">
      {assignments.length === 0 && <p className="text-xs text-muted-foreground">No steward yet.</p>}
      <ClassRingRoles
        classId={classId}
        assignments={assignments}
        volunteers={stewards.volunteers}
        conflictIds={conflictIds}
        onAssign={stewards.onAssign}
        onUnassign={stewards.onUnassign}
      />
      {volunteersLink}
    </div>
  );
}
