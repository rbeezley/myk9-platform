import { ClassJudgeSelect } from '@/components/classes/ClassJudgeSelect';
import type { JudgeListStatus } from '@/components/classes/useClassJudgeAssignment';
import { NoJudgesNotice } from '@/components/shows/NoJudgesNotice';

/**
 * The class panel's Judge setting (MYK9-1323): the same picker and replicated write as
 * Setup → Classes, one tap instead of the Edit class form. Before the class starts only;
 * after that it reads as text and points at Edit class (see `isJudgeChangeLocked`).
 */
export function FocusedClassJudge({
  showId,
  classId,
  classLabel,
  judgeName,
  assignedJudgeId,
  availableJudges,
  judgeListStatus,
  locked,
  onJudgeChange,
}: {
  showId: string;
  classId: string;
  classLabel: string;
  judgeName: string | null;
  assignedJudgeId: string | null;
  availableJudges: Array<{ id: string; name: string }>;
  judgeListStatus: JudgeListStatus;
  locked: boolean;
  onJudgeChange: (classId: string, judgeId: string) => void;
}) {
  const name = <span className="font-medium">{judgeName || 'Judge not set'}</span>;

  if (locked) {
    return (
      <div className="space-y-1">
        {name}
        <p className="text-xs text-muted-foreground">
          Locked once the class starts. Use Edit class to change it.
        </p>
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
      canAssign
      onJudgeChange={onJudgeChange}
    />
  );
}
