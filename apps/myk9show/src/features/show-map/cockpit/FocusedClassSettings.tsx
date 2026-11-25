import { FocusedClassFields } from './FocusedClassFields';
import { FocusedClassJudge } from './FocusedClassJudge';
import { judgeLockReason } from './focusedClassJudgeModel';
import { SubstituteJudgeEmailOffer } from './SubstituteJudgeEmailOffer';
import { FocusedClassStewards } from './FocusedClassStewards';
import { FocusedClassJudgeScoring, FocusedClassScoringField } from './FocusedClassScoringControls';
import type { useClassJudgeAssignment } from '@/components/classes/useClassJudgeAssignment';
import type {
  FocusedClassModel,
  SecretaryCockpitClass,
  SecretaryCockpitTrial,
} from './secretaryCockpitTypes';

/**
 * The focused class's settings, built from the cockpit's own controls and shown in Edit class
 * (MYK9-2379). Each control keeps the write path it had in the pinned header: the judge's pending
 * assignment lives in `judges` (held by the cockpit), status and expected start write through
 * their own mutations. Managers only: the panel is not offered to anyone else.
 */
export function FocusedClassSettings({
  showId,
  focused,
  sourceClass,
  trial,
  timeZone,
  classes,
  judges,
  showJudge,
}: {
  showId: string;
  focused: FocusedClassModel;
  sourceClass: SecretaryCockpitClass;
  trial: SecretaryCockpitTrial;
  timeZone: string;
  classes: readonly SecretaryCockpitClass[];
  judges: ReturnType<typeof useClassJudgeAssignment>;
  /** False once the live judge control would be locked: Edit class's own Judge field takes over. */
  showJudge: boolean;
}) {
  return (
    <FocusedClassFields
      key={focused.id}
      focused={focused}
      sourceClass={sourceClass}
      trial={trial}
      timeZone={timeZone}
      canManageShow
      // The live picker is gated on the class not having started; the judge-related actions
      // keep their own eligibility checks, so they stay after it (MYK9-2379).
      {...(showJudge
        ? {
            judgeControl: (
              <>
                <FocusedClassJudge
                  showId={showId}
                  classId={sourceClass.id}
                  classLabel={focused.name}
                  judgeName={sourceClass.judgeName ?? null}
                  assignedJudgeId={sourceClass.judgeId ?? null}
                  availableJudges={judges.availableJudges}
                  organization={judges.showOrganization}
                  judgeListStatus={judges.judgeListStatus}
                  lockReason={judgeLockReason(focused)}
                  classStatus={sourceClass.status ?? null}
                  offerSubstituteEmails
                  onJudgeChange={(_classId, judgeId) => judges.assignJudge(sourceClass, judgeId)}
                />
                <FocusedClassJudgeScoring
                  showId={showId}
                  sourceClass={sourceClass}
                  classes={classes}
                />
              </>
            ),
          }
        : {
            judgeExtras: (
              <>
                <SubstituteJudgeEmailOffer
                  classId={sourceClass.id}
                  classLabel={focused.name}
                  assignedJudgeId={sourceClass.judgeId ?? null}
                  judgeName={sourceClass.judgeName ?? null}
                />
                <FocusedClassJudgeScoring
                  showId={showId}
                  sourceClass={sourceClass}
                  classes={classes}
                />
              </>
            ),
          })}
      scoringControl={
        <FocusedClassScoringField
          showId={showId}
          sourceClass={sourceClass}
          className={focused.name}
        />
      }
      // A cancelled class has no ring to staff (MYK9-2328).
      {...(sourceClass.lifecycle !== 'cancelled' && {
        stewardControl: <FocusedClassStewards showId={showId} classId={sourceClass.id} />,
      })}
    />
  );
}
