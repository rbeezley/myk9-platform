/**
 * MYK9-2171: the payouts waiting behind the payout brake, on the payout ledger.
 *
 * Each shows the figures it came from. Approve binds the amount and Stripe
 * account shown (the server refuses if either changed since); the amount is a
 * ceiling, because the nightly run recalculates before it sends and sends less
 * when refunds came in. Hold keeps a payout back with a reason. The brake switch
 * and tally are PayoutBrakeCard, rendered apart so a failed ledger never hides it.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { LedgerRow } from '@/features/payments/payoutLedger';
import { useOnlineStatus } from '@/lib/networkUtils';
import {
  canApprovePayout,
  describePayoutActionError,
  payoutsInApprovalQueue,
  type QueuedPayoutRow,
} from '@/features/payments/payoutApproval';
import { useApprovePayout, useHoldPayout } from '@/features/payments/usePayoutApprovalActions';
import { getPayoutStatusPresentation } from './adminStatusPresentation';
import { formatCents, formatDeductionCents } from '@/lib/format/cents';
import { ConfirmDialog } from '@/components/ui/alert-dialog/confirm-dialog';
import { HoldPayoutDialog } from './HoldPayoutDialog';
import { OFFLINE_PAYOUT_NOTE } from './PayoutBrakeCard';

function payoutLabel(row: LedgerRow): string {
  const show = row.showName ?? `Show unavailable (${row.showId.slice(0, 8)})`;
  return `${row.clubName ?? 'Unknown club'}, ${show}`;
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  );
}

function WaitingPayout({
  row,
  busy,
  onApprove,
  onHold,
}: {
  row: QueuedPayoutRow;
  /** Offline, or an approve or hold is in flight: no action until it settles. */
  busy: boolean;
  onApprove: () => void;
  onHold: () => void;
}) {
  const payout = row.payout;
  const status = getPayoutStatusPresentation(row.payoutStatus);
  const destination = payout.destination;
  const differs = row.computedNetCents !== payout.amountCents;
  return (
    <li className="space-y-3 rounded-xl border border-border p-4" data-testid="waiting-payout">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{payoutLabel(row)}</p>
        <Badge className={status.className}>{status.label}</Badge>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Figure label="Online fees collected">{formatCents(row.onlineCollectedCents)}</Figure>
        <Figure label="Refunds">{formatDeductionCents(row.refundedCents)}</Figure>
        <Figure label="Result">{formatCents(row.computedNetCents)}</Figure>
        <Figure label="Most it can send">
          <span className="font-semibold">{formatCents(payout.amountCents)}</span>
        </Figure>
      </dl>
      {differs && (
        <p className="text-sm text-warning" role="note">
          Today&apos;s entries add up to {formatCents(row.computedNetCents)}, not{' '}
          {formatCents(payout.amountCents)}. The nightly run recalculates before it sends: a lower
          amount is sent as it stands, and a higher one comes back for approval.
        </p>
      )}
      <p className="text-sm">
        <span className="text-muted-foreground">Bank: </span>
        {destination ? (
          <>
            Stripe account <span className="font-mono text-xs">{destination.stripeAccountId}</span>
            {destination.payoutsEnabled ? (
              ', payouts enabled'
            ) : (
              <span className="text-warning">, payouts not enabled at Stripe</span>
            )}
          </>
        ) : (
          <span className="text-warning">
            No Stripe account to send to, so it cannot be approved yet.
          </span>
        )}
      </p>
      {row.payoutStatus === 'held' && payout.holdReason && (
        <p className="text-sm">
          <span className="text-muted-foreground">Held: </span>
          {payout.holdReason}
        </p>
      )}
      {payout.approvalResetReason && row.payoutStatus !== 'approved' && (
        <p className="text-sm">
          <span className="text-muted-foreground">Needs approval again: </span>
          {payout.approvalResetReason}
        </p>
      )}
      {row.payoutStatus === 'approved' && payout.approvedAmountCents !== null && (
        <p className="text-sm text-muted-foreground">
          Approved up to {formatCents(payout.approvedAmountCents)}. The next nightly run
          recalculates and sends.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {canApprovePayout(row) && (
          <Button
            className="min-h-11"
            onClick={onApprove}
            disabled={busy || !destination || payout.amountCents <= 0}
          >
            Approve up to {formatCents(payout.amountCents)}
          </Button>
        )}
        {row.payoutStatus !== 'held' && (
          <Button variant="outline" className="min-h-11" onClick={onHold} disabled={busy}>
            Hold
          </Button>
        )}
      </div>
    </li>
  );
}

export function PayoutApprovalSection({ rows }: { rows: LedgerRow[] }) {
  const online = useOnlineStatus();
  const approve = useApprovePayout();
  const hold = useHoldPayout();
  const [approving, setApproving] = useState<QueuedPayoutRow | null>(null);
  const [holding, setHolding] = useState<QueuedPayoutRow | null>(null);
  const queue = payoutsInApprovalQueue(rows);

  // The hooks reload the ledger when either call settles, so a refusal over
  // stale figures is answered by the new figures appearing.
  const onRefusal = (action: 'approve' | 'hold', error: unknown) => {
    toast.error(describePayoutActionError(action, error));
  };

  // Sends exactly what the dialog showed: the amount and the Stripe account
  // read with the ledger, never a re-read at click time.
  // The dialog closes first so the password prompt is the only one on screen.
  const confirmApprove = () => {
    const row = approving;
    const payout = row?.payout;
    setApproving(null);
    if (!row || !payout?.destination) return;
    approve.mutate(
      {
        payoutId: payout.id,
        amountCents: payout.amountCents,
        stripeAccountId: payout.destination.stripeAccountId,
      },
      {
        onSuccess: () => {
          toast.success(`Approved ${formatCents(payout.amountCents)} for ${payoutLabel(row)}.`);
        },
        onError: error => onRefusal('approve', error),
      }
    );
  };

  const confirmHold = (reason: string) => {
    const payout = holding?.payout;
    if (!holding || !payout) return;
    hold.mutate(
      { payoutId: payout.id, reason },
      {
        onSuccess: () => {
          setHolding(null);
          toast.success(`Held the payout for ${payoutLabel(holding)}.`);
        },
        onError: error => {
          onRefusal('hold', error);
          // The server refused this payout as it now stands (it moved on, or is
          // gone): close, so the reloaded list is what the operator acts on. A
          // network failure carries no code and keeps the typed reason open.
          if ((error as { code?: unknown } | null)?.code) setHolding(null);
        },
      }
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold">Payouts waiting for approval</h3>
        </CardHeader>
        <CardContent className="space-y-3">
          {!online && queue.length > 0 && (
            <p className="text-sm text-warning" role="status">
              {OFFLINE_PAYOUT_NOTE}
            </p>
          )}
          {queue.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payout is waiting for approval.</p>
          ) : (
            <ul className="space-y-3" aria-label="Payouts waiting for approval">
              {queue.map(row => (
                <WaitingPayout
                  key={row.showId}
                  row={row}
                  busy={!online || approve.isPending || hold.isPending}
                  onApprove={() => setApproving(row)}
                  onHold={() => setHolding(row)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={approving !== null}
        onOpenChange={open => !open && setApproving(null)}
        title="Approve this payout?"
        confirmLabel={
          approving ? `Approve up to ${formatCents(approving.payout.amountCents)}` : 'Approve'
        }
        onConfirm={confirmApprove}
        description={
          approving && (
            <>
              <span className="block">
                Up to {formatCents(approving.payout.amountCents)} goes to {payoutLabel(approving)}{' '}
                on the next nightly run. The run recalculates first, so refunds since then lower
                what is sent.
              </span>
              <span className="mt-2 block">
                Stripe account{' '}
                <span className="font-mono text-xs">
                  {approving.payout.destination?.stripeAccountId}
                </span>
                . You will be asked for your password.
              </span>
            </>
          )
        }
      />
      <HoldPayoutDialog
        key={holding?.showId ?? 'none'}
        open={holding !== null}
        payoutLabel={holding ? `The payout for ${payoutLabel(holding)}` : 'This payout'}
        pending={hold.isPending}
        onHold={confirmHold}
        onCancel={() => setHolding(null)}
      />
    </div>
  );
}
