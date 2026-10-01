import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NewJudgeForm } from '@/components/shows/wizard/steps/NewJudgeForm';
import { useShowDetailsStepActions } from '@/components/shows/wizard/steps/useShowDetailsStepActions';

interface ShowEditAddJudgeProps {
  /** The show's organization, when AKC or UKC, so the form opens on it. */
  organization?: string | undefined;
  /** Assign the freshly created judge to the show (still unsaved until Save). */
  onJudgeCreated: (judgeId: string, judgeName: string) => void;
}

/**
 * Creates a judge in place from the Show Edit Judges tab, through the same
 * `NewJudgeForm` and `handleCreateNewJudge` mutation the show wizard uses, so a
 * secretary no longer has to leave the panel for /people (MYK9-903).
 */
export const ShowEditAddJudge: React.FC<ShowEditAddJudgeProps> = ({
  organization,
  onJudgeCreated,
}) => {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { handleCreateNewJudge } = useShowDetailsStepActions();

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add a new judge
      </Button>
    );
  }

  return (
    <NewJudgeForm
      {...(organization === 'AKC' || organization === 'UKC' ? { defaultOrg: organization } : {})}
      onCreateJudge={handleCreateNewJudge}
      onCreated={(personId, data) => {
        void queryClient.invalidateQueries({ queryKey: ['judges', 'withQualifications'] });
        onJudgeCreated(personId, `${data.firstName} ${data.lastName}`);
        setOpen(false);
      }}
      onCancel={() => setOpen(false)}
    />
  );
};
