import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NewJudgeForm } from '@/components/shows/wizard/steps/NewJudgeForm';
import { JUDGE_FORM_ORGS } from '@/components/shows/wizard/steps/OrgAndJudgeNumberFields';
import { useShowDetailsStepActions } from '@/components/shows/wizard/steps/useShowDetailsStepActions';

interface ShowEditAddJudgeProps {
  /** The show's organization. Inline create is offered only for AKC or UKC. */
  organization?: string | undefined;
  /** Assign the freshly created judge to the show (still unsaved until Save). */
  onJudgeCreated: (judgeId: string, judgeName: string) => void;
}

/**
 * Creates a judge in place from the Show Edit Judges tab, through the same
 * `NewJudgeForm` and `handleCreateNewJudge` mutation the show wizard uses, so a
 * secretary no longer has to leave the panel for /people (MYK9-903).
 *
 * The new judge's organization is LOCKED to the show's: this tab lists only
 * judges qualified for the show's organization, so a judge created under another
 * organization would be assigned yet vanish from the list, unremovable.
 */
export const ShowEditAddJudge: React.FC<ShowEditAddJudgeProps> = ({
  organization,
  onJudgeCreated,
}) => {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { handleCreateNewJudge } = useShowDetailsStepActions();

  const supportedOrg = JUDGE_FORM_ORGS.find(o => o === organization);
  if (!supportedOrg) return null;

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add a new judge
      </Button>
    );
  }

  return (
    <NewJudgeForm
      lockedOrg={supportedOrg}
      defaultOrg={supportedOrg}
      onCreateJudge={data => handleCreateNewJudge({ ...data, organization: supportedOrg })}
      onCreated={(personId, data) => {
        void queryClient.invalidateQueries({ queryKey: ['judges', 'withQualifications'] });
        onJudgeCreated(personId, `${data.firstName} ${data.lastName}`);
        setOpen(false);
      }}
      onCancel={() => setOpen(false)}
    />
  );
};
