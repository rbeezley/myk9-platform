import { useClassEntriesSnapshot } from '@/features/at-show/useClassEntriesSnapshot';
import { hasClassStarted } from '@/features/show-map/showMapStatus';
import type { ShowMapEntryInput } from '@/features/show-map/showMapTypes';
import { UNASSIGNED_JUDGE_VALUE } from './ClassJudgeSelect';

export interface JudgeChangeWarningProps {
  classId: string;
  /** The class's stored status. */
  classStatus: string | null | undefined;
  /** The judge the class had before this change. */
  outgoingJudgeId: string | null | undefined;
  outgoingJudgeName: string | null | undefined;
  /** The judge the field now holds. */
  selectedJudgeId: string | null | undefined;
}

function isRealJudgeId(id: string | null | undefined): id is string {
  return Boolean(id) && id !== UNASSIGNED_JUDGE_VALUE;
}

/** The warning's words, naming the judge being replaced. */
function judgeChangeWarningText(outgoingJudgeName: string | null | undefined): string {
  const name = outgoingJudgeName?.trim();
  return `${name && name !== UNASSIGNED_JUDGE_VALUE ? name : 'The judge you replaced'} may have scores on their phone that haven't arrived.`;
}

/**
 * MYK9-2015 (owner, 2026-11-14): a judge's scores saved offline are refused once the class has
 * another judge, and wait in that judge's Scores not sent list. A secretary who changes the judge
 * of a started class is told so under the judge field; nothing is blocked. The entries are read
 * from this device's replica, so the warning works with no signal.
 */
export function JudgeChangeWarning({
  outgoingJudgeId,
  selectedJudgeId,
  ...rest
}: JudgeChangeWarningProps) {
  if (!isRealJudgeId(outgoingJudgeId) || selectedJudgeId === outgoingJudgeId) return null;
  return <StartedClassWarning {...rest} />;
}

function StartedClassWarning({
  classId,
  classStatus,
  outgoingJudgeName,
}: Pick<JudgeChangeWarningProps, 'classId' | 'classStatus' | 'outgoingJudgeName'>) {
  const { rows, failed } = useClassEntriesSnapshot(classId);
  // A class whose dogs cannot be read may well have started: warn rather than stay quiet.
  // Replica rows carry the snake_case columns the classifiers read (as the Show Desk passes them).
  const entries = (rows ?? []) as unknown as ShowMapEntryInput[];
  const started = failed || hasClassStarted(classStatus, entries);
  if (!started) return null;
  return (
    <p role="status" className="mt-1 text-sm text-warning">
      {judgeChangeWarningText(outgoingJudgeName)}
    </p>
  );
}
