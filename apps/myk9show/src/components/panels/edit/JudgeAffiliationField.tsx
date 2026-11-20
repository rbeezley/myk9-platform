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
import {
  useJudgeAffiliationReadiness,
  useJudgeAffiliationReadinessSync,
} from '@/hooks/queries/useJudgeAssignmentUploaded';
import type { User } from '@/types/user-types';
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

const JUDGES_KEY = ['judges', 'withQualifications'] as const;

/** Mounted once in the Judges tab: keeps every row's readiness current (MYK9-2294). */
export const AffiliationSync: React.FC = () => {
  const { data: show } = useEditPanel<ShowEditFormData>();
  useJudgeAffiliationReadinessSync(show.organization === 'ASCA' ? show.id : undefined);
  return null;
};

/**
 * On an ASCA show, the Affiliation field for one assigned judge (MYK9-2294), in either judges
 * list: the qualified one and the "no longer qualified" one, since both can print.
 */
export const JudgeAffiliation: React.FC<{ judgeId: string }> = ({ judgeId }) => {
  const { data: show } = useEditPanel<ShowEditFormData>();
  const { data: judges = [] } = useJudgesWithQualifications();
  if (show.organization !== 'ASCA') return null;
  return (
    <JudgeAffiliationField
      showId={show.id}
      judgeId={judgeId}
      initialValue={judges.find(judge => judge.id === judgeId)?.judgeAffiliation}
    />
  );
};

/** A judge ticked on Edit show's Judges tab: "Assigned to show", then the affiliation. */
export const AssignedJudgeNote: React.FC<{ judgeId: string }> = ({ judgeId }) => (
  <>
    <div className="text-sm text-success mt-2 font-medium">Assigned to show</div>
    <JudgeAffiliation judgeId={judgeId} />
  </>
);

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
  const readiness = useJudgeAffiliationReadiness(showId, judgeId);
  const ready = showId !== undefined && readiness === 'ready';
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? initialValue ?? '';
  const dirty = draft !== null && draft.trim() !== (initialValue ?? '').trim();

  const save = useMutation({
    // Offline, the save is refused with a reconnect message and the draft kept (MYK9-1090);
    // an 'online' mutation would pause silently instead.
    networkMode: 'always',
    mutationFn: () => setJudgeAffiliation(judgeId, showId ?? '', value),
    onSuccess: () => {
      toast.success('Affiliation saved');
      // Show the acknowledged value at once, so the field never falls back to the old one
      // while (or if) the refetch below runs.
      const saved = value.trim() || undefined;
      queryClient.setQueryData<User[]>(JUDGES_KEY, judges =>
        judges?.map(judge => (judge.id === judgeId ? { ...judge, judgeAffiliation: saved } : judge))
      );
      void queryClient.invalidateQueries({ queryKey: JUDGES_KEY });
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      void queryClient.invalidateQueries({ queryKey: [PREMIUM_JUDGE_AFFILIATIONS_KEY] });
      setDraft(null);
    },
    onError: error => {
      const feedback = friendlySaveError(error);
      toast.error(feedback.title, { description: feedback.description });
    },
  });

  // Every assignment is declined or cancelled: the judge does not print, and waiting would
  // never enable the field.
  if (readiness === 'inactive') return null;

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
