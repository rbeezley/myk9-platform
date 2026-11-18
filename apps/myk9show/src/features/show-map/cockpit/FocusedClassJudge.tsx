import { useState } from 'react';
import { isUnsetJudgeName, judgeNameOrUnsetLabel } from '@/utils/classJudgeDisplay';
import { JudgeChangeWarning } from '@/components/classes/JudgeChangeWarning';
import { ClassJudgeSelect, UNASSIGNED_JUDGE_VALUE } from '@/components/classes/ClassJudgeSelect';
import type { JudgeListStatus } from '@/components/classes/useClassJudgeAssignment';
import { NoJudgesNotice } from '@/components/shows/NoJudgesNotice';
import { SubstituteJudgeEmailOffer } from './SubstituteJudgeEmailOffer';

/**
 * The class panel's Judge setting (MYK9-1323): the shared picker and replicated write (also
 * behind Select classes' bulk Assign judge), one tap instead of the Edit class form. Before the class starts only;
 * after that it reads as text and points at Edit class (see `judgeLockReason`).
 */
export function FocusedClassJudge({
  showId,
  classId,
  classLabel,
  judgeName,
  assignedJudgeId,
  availableJudges,
  organization,
  judgeListStatus,
  lockReason,
  classStatus,
  offerSubstituteEmails = false,
  onJudgeChange,
}: {
  showId: string;
  classId: string;
  classLabel: string;
  judgeName: string | null;
  assignedJudgeId: string | null;
  availableJudges: Array<{ id: string; name: string }>;
  /** The show's organization; names the registry when the assigned judge is not qualified for it. */
  organization?: string | null | undefined;
  judgeListStatus: JudgeListStatus;
  /** Why the judge cannot be changed here (`judgeLockReason`); null while it can. */
  lockReason: string | null;
  /** The class's stored status, for the judge-change warning. */
  classStatus?: string | null | undefined;
  /** MYK9-2161: offer the secretary the email telling the class's exhibitors who the new judge is. */
  offerSubstituteEmails?: boolean;
  onJudgeChange: (classId: string, judgeId: string) => void;
}) {
  // MYK9-2015: the picker saves on tap, so remember the judge the first change here replaced;
  // that judge's phone may hold scores the new judge's class will refuse.
  const [replaced, setReplaced] = useState<{
    classId: string;
    judgeId: string | null;
    judgeName: string | null;
  } | null>(null);
  const outgoing = replaced?.classId === classId ? replaced : null;
  const changeJudge = (changedClassId: string, judgeId: string) => {
    const hadJudge = Boolean(assignedJudgeId) && assignedJudgeId !== UNASSIGNED_JUDGE_VALUE;
    if (!outgoing && hadJudge && judgeId !== assignedJudgeId) {
      setReplaced({ classId, judgeId: assignedJudgeId, judgeName });
    }
    onJudgeChange(changedClassId, judgeId);
  };

  // A judge can be assigned before their name resolves; that is not "not set".
  const name = (
    <span className="font-medium">
      {isUnsetJudgeName(judgeName) && assignedJudgeId
        ? 'Judge assigned'
        : judgeNameOrUnsetLabel(judgeName)}
    </span>
  );

  const substituteOffer = offerSubstituteEmails ? (
    <SubstituteJudgeEmailOffer
      classId={classId}
      classLabel={classLabel}
      assignedJudgeId={assignedJudgeId}
      judgeName={judgeName}
    />
  ) : null;

  if (lockReason) {
    return (
      <div className="space-y-1">
        {name}
        <p className="text-xs text-muted-foreground">{lockReason}</p>
        {substituteOffer}
      </div>
    );
  }

  // The judge list is an online read. Until it arrives the picker could only label the
  // assigned judge "unavailable", so show the name; offline or failed, also say why.
  if (judgeListStatus !== 'ready') {
    return (
      <div className="space-y-1">
        {name}
        {judgeListStatus === 'error' && (
          <p className="text-xs text-muted-foreground">
            We couldn&apos;t load the judge list. Try again when you&apos;re back online.
          </p>
        )}
        {substituteOffer}
      </div>
    );
  }

  if (availableJudges.length === 0 && assignedJudgeId === null) {
    return (
      <NoJudgesNotice
        showId={showId}
        message="No judges are available to assign to this class yet."
      />
    );
  }

  return (
    <div className="space-y-1">
      <ClassJudgeSelect
        classId={classId}
        classLabel={classLabel}
        assignedJudgeId={assignedJudgeId}
        availableJudges={availableJudges}
        organization={organization}
        canAssign
        onJudgeChange={changeJudge}
      />
      {outgoing && (
        <JudgeChangeWarning
          classId={classId}
          classStatus={classStatus}
          outgoingJudgeId={outgoing.judgeId}
          outgoingJudgeName={outgoing.judgeName}
          selectedJudgeId={assignedJudgeId}
        />
      )}
      {substituteOffer}
    </div>
  );
}
