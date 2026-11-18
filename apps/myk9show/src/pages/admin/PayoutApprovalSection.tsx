/**
 * MYK9-2171: the payout brake's operator screen, on the payout ledger.
 *
 * While the brake is on, every payout waits here. Each shows the figures it came
 * from; Approve sends exactly the amount and bank account shown (the server
 * refuses if either changed since), and Hold keeps it back with a reason. The
 * brake card carries the running tally the owner uses to decide when to switch
 * the brake off.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { LedgerRow } from '@/features/payments/payoutLedger';
import { formatRecordDateTime } from '@/lib/format/dates';
import {
  canApprovePayout,
  describePayoutActionError,
  formatApprovalTally,
  payoutsInApprovalQueue,
  tallyApprovals,
  type QueuedPayoutRow,
} from '@/features/payments/payoutApproval';
import { useApprovePayout, useHoldPayout } from '@/features/payments/usePayoutApprovalActions';
import { usePayoutBrake, useSetPayoutBrake } from '@/features/payments/usePayoutBrake';
import { getPayoutStatusPresentation } from './adminStatusPresentation';
import { formatCents, formatDeductionCents } from '@/lib/format/cents';
import { ConfirmDialog } from '@/components/ui/alert-dialog/confirm-dialog';
import { HoldPayoutDialog } from './HoldPayoutDialog';

function payoutLabel(row: LedgerRow): string {
  const show = row.showName ?? `Show unavailable (${row.showId.slice(0, 8)})`;
  return `${row.clubName ?? 'Unknown club'}, ${show}`;
}

function PayoutBrakeCard({ rows }: { rows: LedgerRow[] }) {
  const brake = usePayoutBrake();
  const setBrake = useSetPayoutBrake();
  const [confirmOff, setConfirmOff] = useState(false);
  const tally = formatApprovalTally(tallyApprovals(rows));

  // The confirm dialog closes BEFORE the write, so the password prompt the
  // server may ask for is the only dialog on screen.
  const change = (on: boolean) => {
    setConfirmOff(false);
    setBrake.mutate(on, {
      onSuccess: () => {
        toast.success(on ? 'The payout brake is on.' : 'The payout brake is off.');
      },
      onError: error => {
        toast.error(describePayoutActionError(on ? 'brake-on' : 'brake-off', error));
      },
    });
  };

  const state = brake.data;
  return (
    <Card data-testid="payout-brake-card">
      <CardHeader>
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck aria-hidden className="h-5 w-5" />
          Payout brake
        </h3>
        <CardDescription className="max-w-3xl leading-relaxed">
          While the brake is on, no payout goes to a club until you approve it below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="font-medium" data-testid="payout-approval-tally">
          {tally}
        </p>
        {brake.isLoading ? (
          <p className="text-sm text-muted-foreground" role="status">
            Loading the brake…
          </p>
        ) : brake.isError || !state ? (
          <p className="text-sm text-destructive" role="alert">
            Could not read the payout brake, so it cannot be changed here. Restart the app to try
            again.
          </p>
        ) : (
          <>
            <p className="text-sm">
              The brake is <span className="font-semibold">{state.on ? 'on' : 'off'}</span>.{' '}
              <span className="text-muted-foreground">
                {state.changedAt
                  ? `Switched ${state.on ? 'on' : 'off'} by ${state.changedByName ?? 'an unknown person'} on ${formatRecordDateTime(state.changedAt)}.`
                  : 'No change has been recorded since it was set up.'}
              </span>
            </p>
            {state.on ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Turning it off lets the nightly run send new payouts without approval. Payouts
                  already waiting or held still need Approve. You will be asked for your password.
                </p>
                <Button
                  variant="destructive"
                  className="min-h-11"
                  onClick={() => setConfirmOff(true)}
                  disabled={setBrake.isPending}
                >
                  Turn the brake off
                </Button>
              </div>
            ) : (
              <Button
                className="min-h-11"
                onClick={() => change(true)}
                disabled={setBrake.isPending}
              >
                {setBrake.isPending ? 'Turning the brake on…' : 'Turn the brake on'}
              </Button>
            )}
          </>
        )}
      </CardContent>
      <ConfirmDialog
        open={confirmOff}
        onOpenChange={setConfirmOff}
        title="Turn the payout brake off?"
        confirmLabel="Turn the brake off"
        destructive
        onConfirm={() => change(false)}
        description={
          <>
            <span className="block">
              New payouts will go to clubs on the nightly run without your approval.
            </span>
            <span className="mt-2 block">Payouts already waiting or held still need Approve.</span>
          </>
        }
      />
    </Card>
  );
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
  /** An approve or hold is in flight; no second action until it settles. */
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
        <Figure label="Amount to send">
          <span className="font-semibold">{formatCents(payout.amountCents)}</span>
        </Figure>
      </dl>
      {differs && (
        <p className="text-sm text-warning" role="note">
          Today&apos;s entries add up to {formatCents(row.computedNetCents)}, not{' '}
          {formatCents(payout.amountCents)}. The amount to send is refreshed each night; Approve
          sends {formatCents(payout.amountCents)}, and a higher amount tomorrow comes back for
          approval.
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
          Approved for {formatCents(payout.approvedAmountCents)}. It sends on the next nightly run.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {canApprovePayout(row) && (
          <Button
            className="min-h-11"
            onClick={onApprove}
            disabled={busy || !destination || payout.amountCents <= 0}
          >
            Approve {formatCents(payout.amountCents)}
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
  // read with the ledger, never a re-read at click time (MYK9-2170 round 1).
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
      <PayoutBrakeCard rows={rows} />
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold">Payouts waiting for approval</h3>
        </CardHeader>
        <CardContent>
          {queue.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payout is waiting for approval.</p>
          ) : (
            <ul className="space-y-3" aria-label="Payouts waiting for approval">
              {queue.map(row => (
                <WaitingPayout
                  key={row.showId}
                  row={row}
                  busy={approve.isPending || hold.isPending}
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
          approving ? `Approve ${formatCents(approving.payout.amountCents)}` : 'Approve'
        }
        onConfirm={confirmApprove}
        description={
          approving && (
            <>
              <span className="block">
                {formatCents(approving.payout.amountCents)} goes to {payoutLabel(approving)} on the
                next nightly run.
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
