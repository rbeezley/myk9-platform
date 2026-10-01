import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useShowDetailsStepActions } from '@/components/shows/wizard/steps/useShowDetailsStepActions';
import { JUDGE_FORM_ORGS } from '@/components/shows/wizard/steps/OrgAndJudgeNumberFields';
import {
  NewJudgeFormError,
  type CreateJudgeData,
} from '@/components/shows/wizard/steps/NewJudgeForm';
import { useCanWriteJudgeQualifications } from '@/features/judges/canWriteJudgeQualifications';
import type { FormValidation } from '@/hooks/useFormValidation';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import type { ShowEditFormData } from './ShowEditPanel.types';

/**
 * "Create a judge and assign them to this show" for the Show Edit panel
 * (MYK9-908).
 *
 * The create runs inside a MODAL dialog that cannot be dismissed while it is
 * pending, so nothing else in the panel can change underneath it: no tab switch,
 * no organization edit, no Save, no closing the panel. That removes the races
 * the earlier non-modal design had to guard one by one (MYK9-903 rounds 1-3,
 * MYK9-908 review).
 */
export function useShowEditJudgeCreate(
  form: FormValidation<ShowEditFormData> | undefined,
  organization: string | undefined
) {
  const queryClient = useQueryClient();
  const canWriteQualifications = useCanWriteJudgeQualifications();
  const { handleCreateNewJudge } = useShowDetailsStepActions();
  const [open, setOpen] = useState(false);
  const pendingRef = useRef(false);
  // Always the form's CURRENT organization, for the post-create invariant check.
  const organizationRef = useRef(organization);
  organizationRef.current = organization;

  // Inline create is offered only for the orgs the judge form supports. The judge
  // is created under the SHOW's organization: the Judges tab lists only judges
  // qualified for it, so any other org would assign a judge who then vanishes.
  // It also needs the right to write qualifications (secretary or site admin): a club
  // admin would get the person created and then the qualification refused by RLS.
  const supportedOrg = canWriteQualifications
    ? JUDGE_FORM_ORGS.find(org => org === organization)
    : undefined;

  const onOpenChange = useCallback((next: boolean) => {
    // A create is in flight: Escape, overlay click and the X must not close it.
    if (!next && pendingRef.current) return;
    setOpen(next);
  }, []);

  const createAndAssignJudge = useCallback(
    async (input: CreateJudgeData): Promise<void> => {
      if (!supportedOrg || pendingRef.current) return;
      pendingRef.current = true;
      try {
        const judgeId = await handleCreateNewJudge({ ...input, organization: supportedOrg });
        void queryClient.invalidateQueries({ queryKey: ['judges', 'withQualifications'] });
        // Invariant: the modal makes this unreachable. If it ever breaks, assigning
        // would put a judge on the roster the filtered list cannot show or remove.
        if (organizationRef.current !== supportedOrg) {
          throw new NewJudgeFormError(
            `The judge was created, but the show's organization changed. Find them in the ${supportedOrg} list and assign them there.`
          );
        }
        // An updater over the LATEST roster; a judge already assigned is not added twice.
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
      } finally {
        pendingRef.current = false;
      }
      setOpen(false);
    },
    [supportedOrg, handleCreateNewJudge, queryClient, form]
  );

  return { supportedOrg, open, onOpenChange, createAndAssignJudge };
}
