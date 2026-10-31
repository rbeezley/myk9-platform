import { ClassJudgeSelect } from '@/components/classes/ClassJudgeSelect';
import type { JudgeListStatus } from '@/components/classes/useClassJudgeAssignment';
import { NoJudgesNotice } from '@/components/shows/NoJudgesNotice';

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
  onJudgeChange: (classId: string, judgeId: string) => void;
}) {
  // A judge can be assigned before their name resolves; that is not "not set".
  const name = (
    <span className="font-medium">
      {judgeName || (assignedJudgeId ? 'Judge assigned' : 'Judge not set')}
    </span>
  );

  if (lockReason) {
    return (
      <div className="space-y-1">
        {name}
        <p className="text-xs text-muted-foreground">{lockReason}</p>
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
    <ClassJudgeSelect
      classId={classId}
      classLabel={classLabel}
      assignedJudgeId={assignedJudgeId}
      availableJudges={availableJudges}
      organization={organization}
      canAssign
      onJudgeChange={onJudgeChange}
    />
  );
}
