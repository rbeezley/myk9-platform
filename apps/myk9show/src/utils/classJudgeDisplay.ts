import type { ShowJudgeAssignment } from '@/types/judge-types';

type ClassJudgeSource = {
  id?: string | null | undefined;
  judge_assignments?: unknown;
  judge?: string | null | undefined;
  judgeName?: string | null | undefined;
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

/** Screen label for a class with no judge yet. Screens only: stored and printed values stay 'TBD'. */
export const UNSET_JUDGE_LABEL = 'Judge to be announced';
/** For a narrow table cell where the full label would wrap. */
export const UNSET_JUDGE_SHORT_LABEL = 'No judge yet';
/** For places that already print a "Judge" prefix or column header. */
export const UNSET_JUDGE_VALUE = 'To be announced';

/** True when there is no real judge: missing, blank, or the stored 'TBD'. */
export function isUnsetJudgeName(name: string | null | undefined): boolean {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return trimmed === '' || trimmed === UNASSIGNED_LABEL;
}

/** The judge name to show on a screen, or the label (short when `compact`, bare when `bare`) when unset. */
export function judgeNameOrUnsetLabel(
  name: string | null | undefined,
  options: { compact?: boolean; bare?: boolean } = {}
): string {
  if (!isUnsetJudgeName(name)) return (name as string).trim();
  if (options.compact) return UNSET_JUDGE_SHORT_LABEL;
  return options.bare ? UNSET_JUDGE_VALUE : UNSET_JUDGE_LABEL;
}

/** "Judge Jane Smith", or "Judge to be announced" (never "Judge Judge to be announced"). */
export function judgeLine(name: string | null | undefined): string {
  return isUnsetJudgeName(name) ? UNSET_JUDGE_LABEL : `Judge ${(name as string).trim()}`;
}
