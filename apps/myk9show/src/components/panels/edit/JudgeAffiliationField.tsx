import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { queryKeys } from '@/lib/queryClient';
import { PREMIUM_JUDGE_AFFILIATIONS_KEY } from '@/services/database/judges/judgeAffiliationKeys';
import { setJudgeAffiliation } from '@/services/database/judges/setJudgeAffiliation';
import {
  useJudgeAffiliationEditor,
  useJudgeAffiliationRoster,
} from '@/hooks/queries/useJudgeAffiliationEditor';
import { useEditPanel } from './useEditPanel';
import type { ShowEditFormData } from './ShowEditPanel.types';
import { friendlySaveError } from '@/utils/friendlySaveError';

export const JUDGE_AFFILIATION_MAX_LENGTH = 200;
export const JUDGE_AFFILIATION_WAIT = 'Saving the judge first';
export const JUDGE_AFFILIATION_OFFLINE = 'Reconnect to add the affiliation';
export const JUDGE_AFFILIATION_READ_ERROR = 'Could not reach myK9Show to check this judge';

/**
 * MYK9-2297: mounted once inside Edit show's Judges tab, it owns the roster read every
 * Affiliation field selects from, so the tab reads once when it opens and not per judge.
 */
export const AffiliationRoster: React.FC = () => {
  const { data: show } = useEditPanel<ShowEditFormData>();
  useJudgeAffiliationRoster(show.organization === 'ASCA' ? show.id : undefined);
  return null;
};

/**
 * On an ASCA show, the Affiliation field for one assigned judge (MYK9-2294), in either judges
 * list: the qualified one and the "no longer qualified" one, since both can print.
 */
export const JudgeAffiliation: React.FC<{ judgeId: string }> = ({ judgeId }) => {
  const { data: show } = useEditPanel<ShowEditFormData>();
  if (show.organization !== 'ASCA') return null;
  return <JudgeAffiliationField showId={show.id} judgeId={judgeId} />;
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
 * judge's assignment is on the server, so the field stays disabled until the server shows that
 * assignment (before and after Save Changes, and after reopening Edit show).
 */
export const JudgeAffiliationField: React.FC<{ showId: string | undefined; judgeId: string }> = ({
  showId,
  judgeId,
}) => {
  const queryClient = useQueryClient();
  const { readiness, affiliation, showSaved, retry, isReading } = useJudgeAffiliationEditor(
    showId,
    judgeId
  );
  const ready = showId !== undefined && readiness === 'ready';
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? affiliation ?? '';
  const dirty = draft !== null && draft.trim() !== (affiliation ?? '');

  const save = useMutation({
    // Offline, the save is refused with a reconnect message and the draft kept (MYK9-1090);
    // an 'online' mutation would pause silently instead.
    networkMode: 'always',
    mutationFn: () => setJudgeAffiliation(judgeId, showId ?? '', value),
    onSuccess: () => {
      toast.success('Affiliation saved');
      showSaved(value.trim() || null);
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: [PREMIUM_JUDGE_AFFILIATIONS_KEY] });
      void queryClient.invalidateQueries({ queryKey: ['judges', 'withQualifications'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
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
      {readiness === 'error' ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
          <span>{JUDGE_AFFILIATION_READ_ERROR}</span>
          <Button type="button" variant="outline" size="sm" disabled={isReading} onClick={retry}>
            Try again
          </Button>
        </div>
      ) : (
        !ready && (
          <p className="text-sm text-muted-foreground">
            {readiness === 'offline' ? JUDGE_AFFILIATION_OFFLINE : JUDGE_AFFILIATION_WAIT}
          </p>
        )
      )}
    </div>
  );
};
