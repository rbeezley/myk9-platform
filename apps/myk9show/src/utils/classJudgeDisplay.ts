import type { ShowJudgeAssignment } from '@/types/judge-types';

type ClassJudgeSource = {
  id?: string | null | undefined;
  judge_assignments?: unknown;
  judge?: string | null | undefined;
  judgeName?: string | null | undefined;
  judgeId?: string | null | undefined;
  judge_id?: string | null | undefined;
};

/** What every screen and printout says for a class with no judge yet. */
export const UNASSIGNED_JUDGE_LABEL = 'Judge to be announced';
/** Same meaning, for a narrow table cell where the full label will not fit. */
export const UNASSIGNED_JUDGE_SHORT_LABEL = 'No judge yet';

const UNASSIGNED_LABEL = UNASSIGNED_JUDGE_LABEL;

/**
 * Devices may still hold class rows written before MYK9-1846, when an unset judge was stored as
 * the literal 'TBD'. Read those as unset too. This is the only place that knows the literal.
 */
const LEGACY_UNSET_JUDGE_NAME = 'TBD';

/** True when a stored judge name means "no judge yet": empty, missing, or the legacy 'TBD'. */
export function isUnsetJudgeName(name: string | null | undefined): boolean {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return trimmed === '' || trimmed === LEGACY_UNSET_JUDGE_NAME;
}

/** The judge name to show, or the unset label when there is none. */
export function judgeNameLabel(
  name: string | null | undefined,
  options: { short?: boolean } = {}
): string {
  if (!isUnsetJudgeName(name)) return (name as string).trim();
  return options.short ? UNASSIGNED_JUDGE_SHORT_LABEL : UNASSIGNED_JUDGE_LABEL;
}

function cleanJudgeName(value: unknown): string | undefined {
  const name = cleanDisplayName(value);
  return isUnsetJudgeName(name) ? undefined : name;
}

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

  return cleanJudgeName(assignedJudge?.judgeName);
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
    cleanJudgeName(classData.judge) ??
    cleanJudgeName(classData.judgeName) ??
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
