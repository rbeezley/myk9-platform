import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useOnlineStatus } from '@/lib/networkUtils';
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
  const send = useMutation({
    mutationFn: () => queueSubstituteJudgeEmails(classId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
    onError: () => toast.error("We couldn't queue the emails. Try again."),
  });

  const pending = offer.data?.pendingCount ?? 0;
  const sent = offer.data?.sentCount ?? 0;
  if (!assignedJudgeId || !offer.data || (pending === 0 && sent === 0)) return null;

  if (pending === 0) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Emailed {people(sent)} who were told no judge yet.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
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
