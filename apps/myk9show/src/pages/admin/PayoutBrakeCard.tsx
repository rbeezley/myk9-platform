/**
 * MYK9-2171: the payout brake switch and the running tally the owner uses to
 * decide when to switch it off.
 *
 * Rendered on its own, outside the ledger's loading and error states: the
 * brake reads platform_settings, not the ledger, and an operator looking at a
 * failed ledger must still be able to turn it back ON. Only switching it OFF
 * waits for the tally, because the tally is the evidence for that decision.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/alert-dialog/confirm-dialog';
import type { LedgerPayout } from '@/features/payments/payoutLedger';
import {
  describePayoutActionError,
  formatApprovalTally,
  tallyApprovals,
} from '@/features/payments/payoutApproval';
import { usePayoutBrake, useSetPayoutBrake } from '@/features/payments/usePayoutBrake';
import { formatRecordDateTime } from '@/lib/format/dates';
import { useOnlineStatus } from '@/lib/networkUtils';

export const OFFLINE_PAYOUT_NOTE = 'You are offline. Payout decisions need a connection.';

/** `payouts` is every payout row read by the ledger; undefined while it is unread. */
export function PayoutBrakeCard({ payouts }: { payouts: LedgerPayout[] | undefined }) {
  const brake = usePayoutBrake();
  const setBrake = useSetPayoutBrake();
  const online = useOnlineStatus();
  const [confirmOff, setConfirmOff] = useState(false);

  // The confirm dialog closes BEFORE the write, so the password prompt the
  // server may ask for is the only dialog on screen.
  const change = (on: boolean) => {
    setConfirmOff(false);
    // Checked again at confirm time: the tally can become unreadable while the
    // confirm dialog is open (a refetch fails behind it).
    if (!on && !payouts) {
      toast.error('The brake was not changed. The approval tally could not be read.');
      return;
    }
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
          {payouts
            ? formatApprovalTally(tallyApprovals(payouts))
            : 'The approval tally could not be read yet.'}
        </p>
        {!online && (
          <p className="text-sm text-warning" role="status">
            {OFFLINE_PAYOUT_NOTE}
          </p>
        )}
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
                  {payouts
                    ? 'Turning it off lets the nightly run send new payouts without approval. Payouts already waiting or held still need Approve. You will be asked for your password.'
                    : 'It can be turned off once the tally above can be read.'}
                </p>
                <Button
                  variant="destructive"
                  className="min-h-11"
                  onClick={() => setConfirmOff(true)}
                  disabled={!payouts || !online || setBrake.isPending}
                >
                  Turn the brake off
                </Button>
              </div>
            ) : (
              <Button
                className="min-h-11"
                onClick={() => change(true)}
                disabled={!online || setBrake.isPending}
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
