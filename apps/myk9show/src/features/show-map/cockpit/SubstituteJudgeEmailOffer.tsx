import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useOnlineStatus } from '@/lib/networkUtils';
import { SET_CLASS_JUDGE_RPC } from '@/services/replication/classJudgePick';
import type { UploadCompleteEventDetail } from '@myk9/replication';
import {
  dismissSubstituteJudgeEmailOffer,
  fetchSubstituteJudgeEmailOffer,
  queueSubstituteJudgeEmails,
} from './substituteJudgeEmails';

const offerKey = (classId: string, judgeId: string | null) =>
  ['substitute-judge-email-offer', classId, judgeId] as const;

/**
 * MYK9-2161 (owner, 2026-11-18): a confirmed judge replaced another (or filled a class whose judge
 * left). One action: email the exhibitors in the class who the judge is now. It disappears once sent
 * or dismissed for that judge. A class that never had a judge shows nothing. Online only: the offer
 * and the queueing are server actions, and the pick must have reached the server first.
 */
export function SubstituteJudgeEmailOffer({
  classId,
  classLabel,
  assignedJudgeId,
  judgeName,
}: {
  classId: string;
  classLabel: string;
  assignedJudgeId: string | null;
  judgeName: string | null;
}) {
  const online = useOnlineStatus();
  const queryClient = useQueryClient();
  const key = offerKey(classId, assignedJudgeId);
  const offer = useQuery({
    queryKey: key,
    queryFn: () => fetchSubstituteJudgeEmailOffer(classId),
    enabled: Boolean(assignedJudgeId) && online,
    staleTime: 0,
    retry: false,
  });
  // The pick is a queued upload: the server only knows the substitute once it lands, so ask again
  // when an upload carrying a judge pick for THIS class completes. A batch that does not say what it
  // carried is treated as possibly relevant.
  const { refetch } = offer;
  useEffect(() => {
    if (!assignedJudgeId) return;
    const onUpload = (event: Event) => {
      const mutations = (event as CustomEvent<UploadCompleteEventDetail | undefined>).detail
        ?.mutations;
      if (
        mutations &&
        !mutations.some(m => m.rpcName === SET_CLASS_JUDGE_RPC && String(m.rowId) === classId)
      ) {
        return;
      }
      void refetch();
    };
    window.addEventListener('replication:upload-complete', onUpload);
    return () => window.removeEventListener('replication:upload-complete', onUpload);
  }, [assignedJudgeId, classId, refetch]);

  const target = offer.data;
  const recipients = target?.recipientCount ?? 0;
  const send = useMutation({
    mutationFn: () => queueSubstituteJudgeEmails(classId, assignedJudgeId ?? ''),
    onSuccess: async queued => {
      await queryClient.invalidateQueries({ queryKey: key });
      if (queued === 0) {
        // Another tap or another secretary already sent it: nothing alarming, and the offer is gone.
        // If the offer is still up, everyone left has an email going out right now.
        const left = queryClient.getQueryData<{ recipientCount: number }>(key)?.recipientCount ?? 0;
        if (left > 0) {
          toast.info(
            'Some exhibitors already have an email going out. Tap again in a few minutes to email them too.'
          );
        }
        return;
      }
      if (queued < recipients) {
        toast.info(
          'Some exhibitors already have an email going out. Tap again in a few minutes to email them too.'
        );
      } else {
        toast.success(
          `Emailing ${recipients === 1 ? '1 exhibitor' : `${recipients} exhibitors`} in a few minutes.`
        );
      }
    },
    onError: error => onFailure(error, "We couldn't queue the emails. Try again."),
  });
  const dismiss = useMutation({
    mutationFn: () => dismissSubstituteJudgeEmailOffer(classId, assignedJudgeId ?? ''),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
    onError: error => onFailure(error, "We couldn't hide this. Try again."),
  });
  function onFailure(error: unknown, fallback: string) {
    // P0001: the class has another judge on the server now; look again before asking anyone.
    const changed = (error as { code?: string } | null)?.code === 'P0001';
    toast.error(changed ? 'The judge for this class changed. Check again.' : fallback);
    if (changed) void queryClient.invalidateQueries({ queryKey: key });
  }

  if (!assignedJudgeId || !target || target.judgeId !== assignedJudgeId || recipients === 0) {
    return null;
  }
  const busy = send.isPending || dismiss.isPending;
  const who = judgeName?.trim() ? judgeName : 'the new judge';
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-auto min-h-11 whitespace-normal py-2 text-left"
          disabled={!online || busy}
          onClick={() => send.mutate()}
        >
          {send.isPending
            ? 'Queuing emails'
            : `Email the exhibitors in ${classLabel} that their judge is now ${who}`}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="min-h-11"
          disabled={!online || busy}
          onClick={() => dismiss.mutate()}
        >
          Not now
        </Button>
      </div>
      {!online && (
        <p className="text-xs text-muted-foreground">Connect to the internet to send this.</p>
      )}
    </div>
  );
}
