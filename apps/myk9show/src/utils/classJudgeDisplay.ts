import type { ShowJudgeAssignment } from '@/types/judge-types';

type ClassJudgeSource = {
  id?: string | null | undefined;
  judge_assignments?: unknown;
  judge?: string | null | undefined;
  judgeName?: string | null | undefined;
  judge_name?: string | null | undefined;
  judgeId?: string | null | undefined;
  judge_id?: string | null | undefined;
};

const UNASSIGNED_LABEL = 'TBD';

function cleanDisplayName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function personDisplayName(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const person = value as Record<string, unknown>;
  return cleanDisplayName(`${person.first_name ?? ''} ${person.last_name ?? ''}`);
}

function readAssignmentJudgeName(classData: ClassJudgeSource): string | undefined {
  const assignments = Array.isArray(classData.judge_assignments)
    ? (classData.judge_assignments as unknown[])
    : [];
  const firstAssignment = assignments[0];
  if (!firstAssignment || typeof firstAssignment !== 'object') return undefined;

  const assignment = firstAssignment as Record<string, unknown>;
  return personDisplayName(assignment.people) ?? personDisplayName(assignment.judge);
}

function readAssignedJudgeForClass(
  classData: ClassJudgeSource,
  assignedJudges: ReadonlyArray<ShowJudgeAssignment>
): string | undefined {
  const classId = cleanDisplayName(classData.id);
  const classJudgeId = cleanDisplayName(classData.judgeId) ?? cleanDisplayName(classData.judge_id);

  const assignedJudge = assignedJudges.find(judge => {
    if (classId && judge.assignedClasses?.includes(classId)) return true;
    return classJudgeId != null && judge.judgeId === classJudgeId;
  });

  return cleanDisplayName(assignedJudge?.judgeName);
}

export function resolveClassJudgeName(
  classData: ClassJudgeSource | null | undefined,
  assignedJudges: ReadonlyArray<ShowJudgeAssignment> = [],
  fallback = UNASSIGNED_LABEL
): string {
  if (!classData) return fallback;

  return (
    readAssignmentJudgeName(classData) ??
    readAssignedJudgeForClass(classData, assignedJudges) ??
    cleanDisplayName(classData.judge) ??
    cleanDisplayName(classData.judgeName) ??
    cleanDisplayName(classData.judge_name) ??
    fallback
  );
}

export function resolveTrialJudgeName(
  classes: ReadonlyArray<ClassJudgeSource>,
  assignedJudges: ReadonlyArray<ShowJudgeAssignment> = [],
  fallback = UNASSIGNED_LABEL
): string {
  const judgeNames = [
    ...new Set(
      classes
        .map(classData => resolveClassJudgeName(classData, assignedJudges, fallback))
        .filter(name => name !== fallback)
    ),
  ];

  if (judgeNames.length === 0) return fallback;
  if (judgeNames.length === 1) return judgeNames[0]!;
  return 'Multiple judges';
}

/**
 * The "(09:00 - 17:00)" suffix shown beside a judge's name in the class judge
 * pickers, or `null` when there is no window worth showing.
 *
 * F13: the call sites guarded only on `availableStartTime !== 'Full Day'`, so a
 * judge with blank times -- which is what the seed and every judge added without
 * an explicit window carry -- rendered the separator and parentheses with nothing
 * in them: "Test Judge( - )". Both times must actually be present.
 */
export function formatJudgeAvailabilityWindow(judge: {
  availableStartTime?: string | null | undefined;
  availableEndTime?: string | null | undefined;
}): string | null {
  const start = cleanDisplayName(judge.availableStartTime);
  const end = cleanDisplayName(judge.availableEndTime);
  if (!start || !end) return null;
  if (start === 'Full Day' || end === 'Full Day') return null;
  return `(${start} - ${end})`;
}
