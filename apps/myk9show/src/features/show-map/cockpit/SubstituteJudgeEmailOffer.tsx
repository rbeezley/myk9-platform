import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useOnlineStatus } from '@/lib/networkUtils';
import { SET_CLASS_JUDGE_RPC } from '@/services/replication/classJudgePick';
import type { UploadCompleteEventDetail } from '@myk9/replication';
import {
  fetchSubstituteJudgeEmailOffer,
  queueSubstituteJudgeEmails,
} from './substituteJudgeEmails';

const offerKey = (classId: string, judgeId: string | null) =>
  ['substitute-judge-email-offer', classId, judgeId] as const;

const people = (count: number) => (count === 1 ? '1 exhibitor' : `${count} exhibitors`);

/**
 * MYK9-2161 (owner, 2026-11-17): a judge left, the exhibitors were emailed "no judge named yet",
 * and a substitute is now confirmed. This offers the secretary one tap to tell exactly those
 * people who it is (the usual judge change email: "was X, now Y"). Nothing is shown for a class
 * that never had a judge, or whose exhibitors were all told already. Online only: the count and
 * the queueing are server actions, and the pick must have reached the server first.
 */
export function SubstituteJudgeEmailOffer({
  classId,
  assignedJudgeId,
}: {
  classId: string;
  assignedJudgeId: string | null;
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
  // when an upload carrying a judge pick for THIS class completes (the secretary's phone may have
  // been offline for minutes). Scores and check-ins from the same device do not count; a batch that
  // does not say what it carried (an older producer) is treated as possibly relevant.
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
  const send = useMutation({
    mutationFn: () => queueSubstituteJudgeEmails(classId, assignedJudgeId ?? ''),
    onSuccess: queued => {
      // Someone's email is already going out right now; it is left alone, so they are still owed this one.
      const left = pending - queued;
      if (left > 0) {
        toast.info(
          `${people(left)} already ${left === 1 ? 'has' : 'have'} an email going out. Tap again in a few minutes to email ${left === 1 ? 'that exhibitor' : 'them'} too.`
        );
      }
      return queryClient.invalidateQueries({ queryKey: key });
    },
    onError: error => {
      // P0001: the class has another judge on the server now; look again before asking anyone.
      const changed = (error as { code?: string } | null)?.code === 'P0001';
      toast.error(
        changed
          ? 'The judge for this class changed. Check again.'
          : "We couldn't queue the emails. Try again."
      );
      if (changed) void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const pending = offer.data?.pendingCount ?? 0;
  const sent = offer.data?.sentCount ?? 0;
  if (assignedJudgeId && offer.isError && !offer.data) {
    return (
      <div className="space-y-1">
        <p role="status" className="text-sm text-muted-foreground">
          We couldn&apos;t check whether any exhibitors still need to hear who the judge is.
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11"
          onClick={() => void offer.refetch()}
        >
          Check again
        </Button>
      </div>
    );
  }
  if (!assignedJudgeId || !offer.data || (pending === 0 && sent === 0)) return null;

  if (pending === 0) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Email is on its way to {people(sent)} who were told no judge yet.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-auto min-h-11 whitespace-normal py-2 text-left"
        disabled={!online || send.isPending}
        onClick={() => send.mutate()}
      >
        {send.isPending
          ? 'Queuing emails'
          : `Email the ${people(pending)} who were told no judge yet`}
      </Button>
      {!online && (
        <p className="text-xs text-muted-foreground">Connect to the internet to send this.</p>
      )}
    </div>
  );
}
