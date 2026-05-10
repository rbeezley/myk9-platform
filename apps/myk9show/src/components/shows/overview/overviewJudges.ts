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
      existing.assignedClasses!.push(cls.id);
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
