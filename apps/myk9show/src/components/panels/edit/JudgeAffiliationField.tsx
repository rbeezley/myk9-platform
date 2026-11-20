import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { queryKeys } from '@/lib/queryClient';
import { PREMIUM_JUDGE_AFFILIATIONS_KEY } from '@/services/database/judges/judgeAffiliationKeys';
import { setJudgeAffiliation } from '@/services/database/judges/setJudgeAffiliation';
import { useJudgesWithQualifications } from '@/hooks/queries/useJudgesWithQualifications';
import { useJudgeAssignmentUploaded } from '@/hooks/queries/useJudgeAssignmentUploaded';
import { useEditPanel } from './useEditPanel';
import type { ShowEditFormData } from './ShowEditPanel.types';
import { friendlySaveError } from '@/utils/friendlySaveError';

export const JUDGE_AFFILIATION_MAX_LENGTH = 200;
export const JUDGE_AFFILIATION_WAIT = 'Saving the judge first';

interface JudgeAffiliationFieldProps {
  showId: string | undefined;
  judgeId: string;
  /** The affiliation stored on the judge's person record. */
  initialValue: string | undefined;
}

/**
 * A judge ticked on Edit show's Judges tab: "Assigned to show", and on an ASCA show the
 * Affiliation field (MYK9-2294).
 */
export const AssignedJudgeNote: React.FC<{ judgeId: string }> = ({ judgeId }) => {
  const { data: show } = useEditPanel<ShowEditFormData>();
  const { data: judges = [] } = useJudgesWithQualifications();
  return (
    <>
      <div className="text-sm text-success mt-2 font-medium">Assigned to show</div>
      {show.organization === 'ASCA' && (
        <JudgeAffiliationField
          showId={show.id}
          judgeId={judgeId}
          initialValue={judges.find(judge => judge.id === judgeId)?.judgeAffiliation}
        />
      )}
    </>
  );
};

/**
 * MYK9-2294 (ASCA §1.5.7): the secretary types a judge's affiliation in Edit show's judges list.
 * Saves through the single-field `set_judge_affiliation` RPC, which the server refuses until the
 * judge's assignment is on the server, so the field stays disabled until the upload is
 * acknowledged (before and after Save Changes, and after reopening Edit show).
 */
export const JudgeAffiliationField: React.FC<JudgeAffiliationFieldProps> = ({
  showId,
  judgeId,
  initialValue,
}) => {
  const queryClient = useQueryClient();
  const uploaded = useJudgeAssignmentUploaded(showId);
  const ready = showId !== undefined && uploaded.has(judgeId);
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? initialValue ?? '';
  const dirty = draft !== null && draft.trim() !== (initialValue ?? '').trim();

  const save = useMutation({
    mutationFn: () => setJudgeAffiliation(judgeId, showId ?? '', value),
    onSuccess: () => {
      toast.success('Affiliation saved');
      void queryClient.invalidateQueries({ queryKey: ['judges', 'withQualifications'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      void queryClient.invalidateQueries({ queryKey: [PREMIUM_JUDGE_AFFILIATIONS_KEY] });
      setDraft(null);
    },
    onError: error => {
      const feedback = friendlySaveError(error);
      toast.error(feedback.title, { description: feedback.description });
    },
  });

  const inputId = `judge-affiliation-${judgeId}`;
  return (
    <div className="mt-3 space-y-1">
      <Label htmlFor={inputId}>Affiliation</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={inputId}
          value={value}
          maxLength={JUDGE_AFFILIATION_MAX_LENGTH}
          placeholder="ASCA-approved judge, Region 4"
          disabled={!ready || save.isPending}
          onChange={event => setDraft(event.target.value)}
          className="max-w-sm"
        />
        <Button
          type="button"
          variant="outline"
          disabled={!ready || !dirty || save.isPending}
          onClick={() => save.mutate()}
        >
          Save affiliation
        </Button>
      </div>
      {!ready && <p className="text-sm text-muted-foreground">{JUDGE_AFFILIATION_WAIT}</p>}
    </div>
  );
};
