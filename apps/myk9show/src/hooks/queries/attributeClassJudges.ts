import { ACTIVE_JUDGE_ASSIGNMENT_STATUSES } from '@/services/database/judges/assignmentStatus';

export interface ClassJudgeAssignmentRow {
  class_id: string | null;
  person_id: string | null;
  status: string | null;
}

/**
 * A class has exactly one judge. Attribute each class to its confirmed assignment when it
 * has one, otherwise to its invited assignment (show-day authorization lets an invited
 * judge score). Declined, cancelled and removed assignments never count.
 */
export function attributeClassJudges(
  rows: readonly ClassJudgeAssignmentRow[]
): Map<string, string> {
  const [confirmed, invited] = ACTIVE_JUDGE_ASSIGNMENT_STATUSES;
  const result = new Map<string, string>();
  for (const status of [confirmed, invited]) {
    for (const row of rows) {
      if (row.status !== status || !row.class_id || !row.person_id) continue;
      if (!result.has(row.class_id)) result.set(row.class_id, row.person_id);
    }
  }
  return result;
}
