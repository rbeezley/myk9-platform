import { ACTIVE_JUDGE_ASSIGNMENT_STATUSES } from '@/services/database/judges/assignmentStatus';

export interface ClassJudgeAssignmentRow {
  class_id: string | null;
  person_id: string | null;
  status: string | null;
}

/**
 * A class has exactly one judge. Attribute each class to its confirmed assignment when it
 * has one, otherwise to its invited assignment (show-day authorization lets an invited
 * judge score). Declined, cancelled and removed assignments never count. When the deciding
 * tier names more than one person (several open invitations, no confirmation), the class is
 * left unattributed rather than credited to whichever row came back first.
 */
export function attributeClassJudges(
  rows: readonly ClassJudgeAssignmentRow[]
): Map<string, string> {
  const [confirmed, invited] = ACTIVE_JUDGE_ASSIGNMENT_STATUSES;
  const candidates = new Map<string, Map<string, Set<string>>>();
  for (const row of rows) {
    if (!row.class_id || !row.person_id || !row.status) continue;
    const byStatus = candidates.get(row.class_id) ?? new Map<string, Set<string>>();
    byStatus.set(row.status, (byStatus.get(row.status) ?? new Set()).add(row.person_id));
    candidates.set(row.class_id, byStatus);
  }
  const result = new Map<string, string>();
  for (const [classId, byStatus] of candidates) {
    const people = byStatus.get(confirmed) ?? byStatus.get(invited);
    if (people?.size === 1) result.set(classId, [...people][0] as string);
  }
  return result;
}
