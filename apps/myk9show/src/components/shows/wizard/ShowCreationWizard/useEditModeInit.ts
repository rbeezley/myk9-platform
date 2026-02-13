import { useEffect } from 'react';
import { useWizardStore } from '@/store/wizardStore';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { useUserStore } from '@/store/userStore';
import type { EditMode } from './types';

/**
 * Hook that initialises the wizard store with existing show data when the wizard
 * opens in edit mode (add-trials, add-classes, or edit-show).
 */
export function useEditModeInit(editMode: EditMode | undefined, open: boolean): void {
  const { loadDraft } = useWizardStore();
  const { shows } = useShowStore();
  const { trials: existingTrials } = useTrialStore();
  const { classes: existingClasses } = useClassStoreCompat();
  const { people } = useUserStore();

  useEffect(() => {
    if (!editMode || !open) return;

    const existingShow = shows.find(s => s.id === editMode.showId);
    const showTrials = existingTrials.filter(t => t.showId === editMode.showId);

    if (!existingShow) return;

    // Transform existing trials to wizard format
    const wizardTrials = showTrials.map(trial => {
      const trialClasses = existingClasses.filter(c => c.trialId === trial.id);

      const wizardClasses = trialClasses.map(classData => {
        let judgeId = '';
        if (classData.judge && classData.judge !== 'TBD') {
          const matchingJudge = existingShow.assignedJudges?.find(
            j => j.judgeName === classData.judge,
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
          judgeId,
        };
      });

      return {
        id: trial.id,
        name: trial.type || trial.name || 'Trial',
        dateTime: trial.trialDate,
        eventNumber: trial.eventNumber || '',
        classes: wizardClasses,
      };
    });

    // Build judge details from assigned judges and people store
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

    existingShow.assignedJudges?.forEach(judge => {
      const personInfo = people.find(p => p.id === judge.judgeId);

      judgeDetailsMap[judge.judgeId] = {
        name: personInfo ? `${personInfo.firstName} ${personInfo.lastName}` : judge.judgeName,
        email: personInfo?.email || '',
        phone: personInfo?.phone || '',
        certifications: personInfo?.judgeQualifications?.map(q => q.organization) || [],
        notes: '',
      };
    });

    loadDraft({
      show: {
        name: existingShow.name,
        type: existingShow.type as 'AKC' | 'UKC' | 'Other',
        startDate: existingShow.startDate,
        endDate: existingShow.endDate,
        location: existingShow.location,
        clubId: existingShow.clubId,
        entryOpenDate: existingShow.entryOpenDate,
        entryCloseDate: existingShow.entryCloseDate,
        preEntryFee: parseFloat(existingShow.preEntryFee) || 0,
        dayOfShowFee: parseFloat(existingShow.dayOfShowFee || '0') || 0,
        chairman: existingShow.chairman,
        secretary: existingShow.secretary,
        judgeIds: existingShow.assignedJudges?.map(j => j.judgeId) || [],
      },
      trials: wizardTrials,
      judgeDetails: judgeDetailsMap,
      currentStep:
        editMode.mode === 'add-trials' ? 1
        : editMode.mode === 'add-classes' ? 2
        : 0,
      completedSteps:
        editMode.mode === 'add-trials' ? [0]
        : editMode.mode === 'add-classes' ? [0, 1]
        : [],
    });
  }, [editMode, open, shows, existingTrials, loadDraft, people, existingClasses]);
}
