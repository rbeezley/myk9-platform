import { useShowStore } from '@/store/showStore';
import { ClassScoringSwitch, JudgeScoringChoice } from './FocusedClassScoring';
import {
  SCORING_COPY,
  canSwitchScoring,
  isClassOnPaper,
  judgeScoringModel,
} from './classScoringModel';
import type { SecretaryCockpitClass } from './secretaryCockpitTypes';

/**
 * The show's device-scoring switch, read from the live replica so a flip in Edit show reaches the
 * panel at once (the route's show lags a local save until sync). Unknown stays undefined.
 */
function useShowUsesDeviceScoring(showId: string): boolean | undefined {
  return useShowStore(state => state.shows.find(show => show.id === showId)?.usesDeviceScoring);
}

/** The class panel's Scoring field: the one-tap switch, or plain words once the class is over or off. */
export function FocusedClassScoringField({
  showId,
  sourceClass,
  className,
}: {
  showId: string;
  sourceClass: SecretaryCockpitClass;
  className: string;
}) {
  const usesDeviceScoring = useShowUsesDeviceScoring(showId);
  if (!canSwitchScoring(sourceClass.lifecycle)) {
    const onPaper = isClassOnPaper(sourceClass.scoresOnPaper, usesDeviceScoring);
    return (
      <span className="font-medium">
        {onPaper === null ? '' : onPaper ? SCORING_COPY.paper : SCORING_COPY.phone}
      </span>
    );
  }
  return (
    <ClassScoringSwitch
      classId={sourceClass.id}
      className={className}
      scoresOnPaper={sourceClass.scoresOnPaper}
      showUsesDeviceScoring={usesDeviceScoring}
    />
  );
}

/** Under the class's Judge picker: one choice for every class that judge has. Nothing without a judge or a class to switch. */
export function FocusedClassJudgeScoring({
  showId,
  sourceClass,
  classes,
}: {
  showId: string;
  sourceClass: SecretaryCockpitClass;
  classes: readonly SecretaryCockpitClass[];
}) {
  const usesDeviceScoring = useShowUsesDeviceScoring(showId);
  const judgeId = sourceClass.judgeId;
  if (!judgeId) return null;
  const model = judgeScoringModel(classes, judgeId, usesDeviceScoring);
  if (!model.state) return null;
  return (
    <JudgeScoringChoice
      judgeName={sourceClass.judgeName || 'this judge'}
      model={model}
      showUsesDeviceScoring={usesDeviceScoring}
    />
  );
}
