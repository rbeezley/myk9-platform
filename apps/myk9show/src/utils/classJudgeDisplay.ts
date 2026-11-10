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
export const UNSET_JUDGE_LABEL = 'Judge to be announced';
/** For a narrow table cell where the full label would wrap. */
export const UNSET_JUDGE_SHORT_LABEL = 'No judge yet';

/**
 * Older builds stored the literal 'TBD' as a class's judge name; devices can still
 * hold those rows. This is the one place that knows the legacy value.
 */
const LEGACY_UNSET_JUDGE_NAME = 'TBD';

/**
 * True when there is no real judge: missing, blank, the legacy 'TBD', or either unset
 * display label (a name that already went through `judgeNameOrUnsetLabel`). Anything that
 * asks "is there a real judge?" asks this, so a label can never be printed as a name.
 */
export function isUnsetJudgeName(name: string | null | undefined): boolean {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return (
    trimmed === '' ||
    trimmed === LEGACY_UNSET_JUDGE_NAME ||
    trimmed === UNSET_JUDGE_LABEL ||
    trimmed === UNSET_JUDGE_SHORT_LABEL
  );
}

/** The name when there is a real judge, otherwise undefined (official forms print blank). */
export function realJudgeNameOrUndefined(name: string | null | undefined): string | undefined {
  return isUnsetJudgeName(name) ? undefined : (name as string).trim();
}

/**
 * The judge name an official registry form prints: the real name, or the legacy placeholder
 * 'TBD' when the judge is unset (blank stays undefined so the caller's own blank handling
 * applies). Registry forms keep "TBD" until the owner decides otherwise; the display label
 * must never reach them, and this is the only place that writes the literal for them.
 */
export function registryFormJudgeName(name: string | null | undefined): string | undefined {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed === '') return undefined;
  return isUnsetJudgeName(trimmed) ? LEGACY_UNSET_JUDGE_NAME : trimmed;
}

/** "Judge Jane Smith", or the unset label on its own ("Judge Judge to be announced" never). */
export function judgeLine(name: string | null | undefined): string {
  return isUnsetJudgeName(name) ? UNSET_JUDGE_LABEL : `Judge ${(name as string).trim()}`;
}

/** The judge name to show, or the label (short form when `compact`) when unset. */
export function judgeNameOrUnsetLabel(
  name: string | null | undefined,
  options: { compact?: boolean } = {}
): string {
  if (!isUnsetJudgeName(name)) return (name as string).trim();
  return options.compact ? UNSET_JUDGE_SHORT_LABEL : UNSET_JUDGE_LABEL;
}

const UNASSIGNED_LABEL = UNSET_JUDGE_LABEL;

function cleanDisplayName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function storedJudgeName(value: unknown): string | undefined {
  const name = cleanDisplayName(value);
  return name !== undefined && !isUnsetJudgeName(name) ? name : undefined;
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
    storedJudgeName(classData.judge) ??
    storedJudgeName(classData.judgeName) ??
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
