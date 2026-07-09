import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Ban } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/lib/supabase';
import { useShowRefundAll, type ShowRefundAllResult } from '@/features/payments/useShowRefundAll';
import { friendlyDbError } from '@/utils/friendlyDbError';
import { RefundResultDetail } from '@/components/shows/RefundResultDetail';

// INTENT: A bulk make-whole refund is a SHOW-CANCELLATION action and irreversible
// money movement. It is deliberately TWO steps — mark the show cancelled, THEN
// refund — so an active/upcoming show's paid entries can never be refunded by a
// single misclick. The server independently requires shows.status = 'cancelled'.
// Do not collapse into one click.

interface RefundAllEntriesCardProps {
  showId: string;
}

function useShowStatus(showId: string) {
  return useQuery({
    queryKey: ['show-status', showId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shows')
        .select('status')
        .eq('id', showId)
        .single();
      if (error) throw error;
      return (data?.status ?? null) as string | null;
    },
  });
}

/** Count of entries this bulk refund could touch (online-paid). An upper bound —
 * the server still skips already-refunded / cross-show intents. */
function useRefundableEntryCount(showId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['refundable-entry-count', showId],
    enabled,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('entries')
        .select('id', { count: 'exact', head: true })
        .eq('show_id', showId)
        .eq('payment_method', 'online')
        .eq('payment_status', 'paid');
      if (error) throw error;
      return count ?? 0;
    },
  });
}

function useMarkShowCancelled(showId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('shows')
        .update({ status: 'cancelled' })
        .eq('id', showId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['show-status', showId] });
      toast.success('Show marked cancelled. You can now refund all entries.');
    },
    onError: err =>
      toast.error(friendlyDbError(err, 'Could not cancel the show. Please try again.')),
  });
}

export function RefundAllEntriesCard({ showId }: RefundAllEntriesCardProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<ShowRefundAllResult | null>(null);

  const { data: status } = useShowStatus(showId);
  const isCancelled = status === 'cancelled';
  const { data: count } = useRefundableEntryCount(showId, isCancelled);
  const markCancelled = useMarkShowCancelled(showId);
  const refundAll = useShowRefundAll();

  const handleConfirm = () => {
    setConfirmOpen(false);
    setResult(null);
    refundAll.mutate(showId, {
      onSuccess: data => {
        setResult(data);
        const { entriesRefunded, skipped, failed } = data.summary;
        const noun = (n: number) => `entr${n === 1 ? 'y' : 'ies'}`;
        if (entriesRefunded === 0) {
          // Nothing was actually refunded — never a success toast.
          if (failed > 0) toast.error(`No refunds issued — ${failed} failed.`);
          else if (skipped > 0)
            toast.warning(`No refunds issued — ${skipped} skipped, handle manually.`);
          else toast.info('Nothing to refund.');
        } else if (failed > 0) {
          toast.warning(
            `Refunded ${entriesRefunded} ${noun(entriesRefunded)}, ${failed} failed — see details.`
          );
        } else {
          toast.success(`Refunded ${entriesRefunded} ${noun(entriesRefunded)} in full.`);
        }
      },
      onError: err =>
        toast.error(friendlyDbError(err, 'Could not refund entries. Please try again.')),
    });
  };

  const hasNothingToRefund = count === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          Refund all entries
        </CardTitle>
        <CardDescription>
          Cancelling the show? Refund every online-paid exhibitor in full — entry fee{' '}
          <strong>and</strong> service fees. Cash/check payments are listed for you to handle
          manually. This cannot be undone.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {!isCancelled ? (
          // Step 1 — the show must be cancelled before any money moves.
          <>
            <p className="text-sm text-muted-foreground">
              This show is still active. To refund every exhibitor, mark it cancelled first.
            </p>
            <Button
              variant="outline"
              disabled={status === undefined || markCancelled.isPending}
              onClick={() => markCancelled.mutate()}
            >
              <Ban className="mr-2 h-4 w-4" />
              {markCancelled.isPending ? 'Marking cancelled…' : 'Mark show as cancelled'}
            </Button>
          </>
        ) : (
          // Step 2 — the show is cancelled; refunds are now allowed.
          <>
            <p className="text-sm text-muted-foreground">
              {count === undefined
                ? 'Checking paid entries…'
                : hasNothingToRefund
                  ? 'No online-paid entries to refund.'
                  : `${count} online-paid entr${count === 1 ? 'y' : 'ies'} can be refunded.`}
            </p>

            <Button
              variant="destructive"
              disabled={hasNothingToRefund || refundAll.isPending}
              onClick={() => setConfirmOpen(true)}
            >
              {refundAll.isPending ? 'Refunding…' : 'Refund all entries…'}
            </Button>

            {result && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm" role="status">
                <p className="font-medium">
                  Refunded {result.summary.entriesRefunded} entr
                  {result.summary.entriesRefunded === 1 ? 'y' : 'ies'} across{' '}
                  {result.summary.intentsRefunded} payment
                  {result.summary.intentsRefunded === 1 ? '' : 's'}.
                </p>
                {result.summary.skipped > 0 && (
                  <p className="text-muted-foreground">
                    {result.summary.skipped} skipped (cash/check, already refunded, or shared
                    payment) — handle manually.
                  </p>
                )}
                {result.summary.failed > 0 && (
                  <p className="text-destructive">
                    {result.summary.failed} failed — retry is safe (refunds are not duplicated).
                  </p>
                )}
                <RefundResultDetail result={result} />
              </div>
            )}
          </>
        )}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Refund all online-paid entries?</AlertDialogTitle>
            <AlertDialogDescription>
              This refunds {count ?? 0} online-paid entr{count === 1 ? 'y' : 'ies'} for this
              cancelled show in full, including service fees, back to each exhibitor’s card. It
              cannot be undone. Cash and check payments are not touched — refund those manually.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Yes, refund {count ?? 0} entr{count === 1 ? 'y' : 'ies'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
