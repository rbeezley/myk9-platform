export const ACTIVE_JUDGE_ASSIGNMENT_STATUSES = ['confirmed', 'invited'] as const;

export type ActiveJudgeAssignmentStatus = (typeof ACTIVE_JUDGE_ASSIGNMENT_STATUSES)[number];

const ACTIVE_JUDGE_ASSIGNMENT_STATUS_SET: ReadonlySet<string> = new Set(
  ACTIVE_JUDGE_ASSIGNMENT_STATUSES
);

export function isActiveJudgeAssignmentStatus(
  status: string | null | undefined
): status is ActiveJudgeAssignmentStatus {
  return status !== null && status !== undefined && ACTIVE_JUDGE_ASSIGNMENT_STATUS_SET.has(status);
}
