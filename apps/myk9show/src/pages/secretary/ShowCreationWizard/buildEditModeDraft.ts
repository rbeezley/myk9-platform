/**
 * Builds the wizard draft from an existing show when the wizard is opened in an
 * edit mode (`add-trials` / `add-classes` / `edit-show`). Extracted from
 * ShowCreationWizardPage's initialization effect — pure transformation so the
 * page keeps only the orchestration (ref-guarding, loadDraft, officials
 * backfill).
 *
 * The return type is intentionally inferred: `WizardState` is not exported from
 * the store, but the inferred object is structurally a `Partial<WizardState>`,
 * which is exactly what `loadDraft` accepts at the call site.
 */
import type { Show } from '@/types/show-types';
import type { User } from '@/types/user-types';
import type { Trial } from '@/store/trialStore';
import type { SyncableClassData } from '@/store/classStore';
import type { EditMode } from './show-creation-wizard-types';

interface BuildEditModeDraftArgs {
  editMode: EditMode;
  existingShow: Show;
  /** Trials already belonging to the show being edited. */
  showTrials: Trial[];
  /** All loaded classes (filtered per-trial inside). */
  existingClasses: SyncableClassData[];
  /** People directory, used to enrich judge contact details. */
  people: User[];
}

export function buildEditModeDraft({
  editMode,
  existingShow,
  showTrials,
  existingClasses,
  people,
}: BuildEditModeDraftArgs) {
  // In add-trials mode, don't load existing trials — start fresh.
  // Existing trials should be edited via Edit Trial on the trial detail page.
  const wizardTrials =
    editMode.mode === 'add-trials'
      ? []
      : showTrials.map(trial => {
          const trialClasses = existingClasses.filter(c => c.trialId === trial.id);

          const wizardClasses = trialClasses.map(classData => {
            let judgeId = '';
            if (classData.judge && classData.judge !== 'TBD') {
              const matchingJudge = existingShow.assignedJudges?.find(
                j => j.judgeName === classData.judge
              );
              if (matchingJudge) {
                judgeId = matchingJudge.judgeId;
              }
            }

            return {
              templateId: classData.templateId || '',
              customizations: {
                className: classData.className,
                element: classData.element,
                level: classData.level,
                section: classData.section,
                fieldOverrides: {},
              },
              judgeId: judgeId,
            };
          });

          return {
            id: trial.id,
            name: trial.type || trial.name || 'Trial',
            dateTime: trial.trialDate,
            eventNumber: trial.eventNumber || '',
            trialType: trial.trialType || undefined,
            classes: wizardClasses,
          };
        });

  // Build judge details from show's assigned judges
  const showJudges = existingShow.assignedJudges || [];
  const judgeDetailsMap: Record<
    string,
    {
      name: string;
      email: string;
      phone: string;
      certifications: string[];
      notes: string;
    }
  > = {};
  showJudges.forEach(judge => {
    const personInfo = people.find(p => p.id === judge.judgeId);

    judgeDetailsMap[judge.judgeId] = {
      name: personInfo ? `${personInfo.firstName} ${personInfo.lastName}` : judge.judgeName,
      email: personInfo?.email || '',
      phone: personInfo?.phone || '',
      certifications: personInfo?.judgeQualifications?.map(q => q.organization) || [],
      notes: '',
    };
  });

  return {
    show: {
      name: existingShow.name,
      organization: existingShow.organization as 'AKC' | 'UKC' | 'Other',
      startDate: existingShow.startDate,
      endDate: existingShow.endDate,
      location: existingShow.location,
      clubId: existingShow.clubId,
      entryOpenDate: existingShow.entryOpenDate,
      entryCloseDate: existingShow.entryCloseDate,
      preEntryFee: parseFloat(existingShow.preEntryFee) || 0,
      dayOfShowFee: parseFloat(existingShow.dayOfShowFee || '0') || 0,
      startingArmbandNumber: existingShow.startingArmbandNumber ?? 100,
      acceptCheckPayments: existingShow.acceptCheckPayments ?? false,
      acceptCashPayments: existingShow.acceptCashPayments ?? false,
      officials: {
        secretary: [] as string[],
        chairman: [] as string[],
        steward: [] as string[],
      },
      judgeIds: showJudges.map(j => j.judgeId),
    },
    trials: wizardTrials,
    judgeDetails: judgeDetailsMap,
    currentStep: editMode.mode === 'add-trials' ? 1 : editMode.mode === 'add-classes' ? 2 : 0,
    completedSteps:
      editMode.mode === 'add-trials' ? [0] : editMode.mode === 'add-classes' ? [0, 1] : [],
  };
}
