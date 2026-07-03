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
