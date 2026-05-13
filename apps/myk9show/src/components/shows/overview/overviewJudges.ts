import type { ShowJudgeAssignment } from '@/types/judge-types';

const UNRESOLVED_JUDGE_NAMES = new Set(['?', 'tbd', 'unknown judge']);

export function hasDisplayableJudgeName(judgeName: string | null | undefined): judgeName is string {
  const normalized = judgeName?.trim();
  return !!normalized && !UNRESOLVED_JUDGE_NAMES.has(normalized.toLowerCase());
}

export function getDisplayableJudges(
  judges: readonly ShowJudgeAssignment[] | null | undefined
): ShowJudgeAssignment[] {
  return (judges ?? [])
    .map(judge => ({ ...judge, judgeName: judge.judgeName?.trim() ?? '' }))
    .filter(judge => hasDisplayableJudgeName(judge.judgeName));
}

export function buildJudgesFromClasses(
  classes: readonly { id: string; judgeName?: string | null }[]
): ShowJudgeAssignment[] {
  const judgeMap = new Map<string, ShowJudgeAssignment>();

  for (const cls of classes) {
    const judgeName = cls.judgeName?.trim();
    if (!hasDisplayableJudgeName(judgeName)) continue;

    const existing = judgeMap.get(judgeName);
    if (existing) {
      existing.assignedClasses = [...(existing.assignedClasses ?? []), cls.id];
    } else {
      judgeMap.set(judgeName, {
        judgeId: judgeName,
        judgeName,
        assignedDate: '',
        assignedClasses: [cls.id],
      });
    }
  }

  return Array.from(judgeMap.values());
}

export function resolveOverviewJudges(
  assignedJudges: readonly ShowJudgeAssignment[] | null | undefined,
  classes: readonly { id: string; judgeName?: string | null }[]
): ShowJudgeAssignment[] {
  const displayableAssignedJudges = getDisplayableJudges(assignedJudges);
  return displayableAssignedJudges.length > 0
    ? displayableAssignedJudges
    : buildJudgesFromClasses(classes);
}

export function resolveOverviewJudgesWithRoster(
  assignedJudges: readonly ShowJudgeAssignment[] | null | undefined,
  rosterJudges: readonly { id: string; name: string }[] | null | undefined,
  classes: readonly { id: string; judgeName?: string | null }[]
): ShowJudgeAssignment[] {
  const rosterNameById = new Map((rosterJudges ?? []).map(judge => [judge.id, judge.name]));
  const assignedById = new Set((assignedJudges ?? []).map(judge => judge.judgeId));
  const enrichedAssignments = (assignedJudges ?? []).map(judge => ({
    ...judge,
    judgeName: hasDisplayableJudgeName(judge.judgeName)
      ? judge.judgeName
      : (rosterNameById.get(judge.judgeId) ?? judge.judgeName),
  }));
  const rosterAssignments: ShowJudgeAssignment[] = (rosterJudges ?? [])
    .filter(judge => !assignedById.has(judge.id))
    .map(judge => ({
      judgeId: judge.id,
      judgeName: judge.name,
      assignedDate: '',
      assignedClasses: [],
    }));

  return resolveOverviewJudges([...enrichedAssignments, ...rosterAssignments], classes);
}
