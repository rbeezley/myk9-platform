import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useShowDetailsStepActions } from '@/components/shows/wizard/steps/useShowDetailsStepActions';
import { JUDGE_FORM_ORGS } from '@/components/shows/wizard/steps/OrgAndJudgeNumberFields';
import type { CreateJudgeData } from '@/components/shows/wizard/steps/NewJudgeForm';
import type { FormValidation } from '@/hooks/useFormValidation';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import type { ShowEditFormData } from './ShowEditPanel.types';

/**
 * Owns "create a judge and assign them to this show" for the Show Edit panel
 * (MYK9-908).
 *
 * The operation lives HERE, at panel level, not in the form that collects the
 * input: the Judges tab (and the form inside it) unmounts whenever the user
 * switches tabs, and an operation owned by something that unmounts either drops
 * its result or appends to a stale roster (MYK9-903 rounds 1-3). Only the panel
 * closing makes the result moot, so only that stops the assignment.
 */
export function useShowEditJudgeCreate(
  form: FormValidation<ShowEditFormData> | undefined,
  organization: string | undefined
) {
  const queryClient = useQueryClient();
  const { handleCreateNewJudge } = useShowDetailsStepActions();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const panelOpenRef = useRef(true);
  useEffect(() => {
    panelOpenRef.current = true;
    return () => {
      panelOpenRef.current = false;
    };
  }, []);

  // Inline create is offered only for the orgs the judge form supports. The new
  // judge is created under the SHOW's organization: the Judges tab lists only
  // judges qualified for it, so any other org would assign a judge who then
  // vanishes from the list, unremovable.
  const supportedOrg = JUDGE_FORM_ORGS.find(org => org === organization);

  const createAndAssignJudge = useCallback(
    async (input: CreateJudgeData): Promise<void> => {
      if (!supportedOrg || inFlightRef.current) return;
      inFlightRef.current = true;
      setPending(true);
      setError(null);
      try {
        const judgeId = await handleCreateNewJudge({ ...input, organization: supportedOrg });
        void queryClient.invalidateQueries({ queryKey: ['judges', 'withQualifications'] });
        if (!panelOpenRef.current) return;
        // An updater over the LATEST roster: toggles made while the create was
        // pending must survive, and a judge already assigned is not added twice.
        form?.setValue('assignedJudges', (previous: unknown) => {
          const roster = (previous as ShowJudgeAssignment[] | undefined) ?? [];
          if (roster.some(judge => judge.judgeId === judgeId)) return roster;
          return [
            ...roster,
            {
              judgeId,
              judgeName: `${input.firstName} ${input.lastName}`,
              assignedDate: new Date().toISOString().split('T')[0],
              availableStartTime: 'Full Day',
              availableEndTime: 'Full Day',
            },
          ];
        });
      } catch (err) {
        if (panelOpenRef.current) setError('Failed to add the judge. Please try again.');
        throw err;
      } finally {
        inFlightRef.current = false;
        if (panelOpenRef.current) setPending(false);
      }
    },
    [supportedOrg, handleCreateNewJudge, queryClient, form]
  );

  return { supportedOrg, createAndAssignJudge, pending, error };
}
