import { useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';

/** Minimal shape required by RequestPaymentDialog. */
export type RequestableEntry = Pick<
  EntryManagementEntry,
  'id' | 'dogName' | 'totalFee' | 'showId'
>;

interface RequestPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: RequestableEntry | null;
  /** Called after a link is generated so the host can refresh "payment requested" state. */
  onRequested?: () => void;
}

interface LinkResult {
  url: string;
  subtotalCents: number;
  platformFeeCents: number;
  totalCents: number;
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function RequestPaymentDialog({
  open,
  onOpenChange,
  entry,
  onRequested,
}: RequestPaymentDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LinkResult | null>(null);
  const [copied, setCopied] = useState(false);
  const inFlightRef = useRef(false);

  const reset = () => {
    setSubmitting(false);
    setError(null);
    setResult(null);
    setCopied(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const handleGenerate = async () => {
    if (!entry || inFlightRef.current) return;
    inFlightRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      // success/cancel point at the show's PUBLIC page so an unauthenticated
      // payer (the mailed-in exhibitor) never hits an auth wall after paying.
      const origin = window.location.origin;
      const { data, error: invokeError } = await supabase.functions.invoke('stripe-payment-link', {
        body: {
          entry_ids: [entry.id],
          success_url: `${origin}/shows/${entry.showId}?payment=success`,
          cancel_url: `${origin}/shows/${entry.showId}?payment=cancelled`,
        },
      });

      if (invokeError) {
        // Edge fn returns a user-facing message in the response body; surface it.
        let message: string | undefined;
        const context = (invokeError as { context?: Response }).context;
        if (context) {
          try {
            message = (await context.json())?.error;
          } catch {
            // fall through to the generic message
          }
        }
        setError(message ?? invokeError.message ?? 'Could not create the payment link');
        return;
      }

      setResult({
        url: data.url,
        subtotalCents: data.subtotal_cents ?? 0,
        platformFeeCents: data.platform_fee_cents ?? 0,
        totalCents: data.total_cents ?? 0,
      });
      onRequested?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the payment link');
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      toast.success('Payment link copied — send it to the exhibitor.');
    } catch {
      // Clipboard can fail (permissions); the link is still visible to copy by hand.
      toast.error('Could not copy automatically — select and copy the link below.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request payment</DialogTitle>
          <DialogDescription>
            {entry
              ? `Generate a secure Stripe payment link for ${entry.dogName ?? 'this entry'}. A card processing fee is added on top of the entry fee — the exhibitor pays the total shown.`
              : ''}
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Entry fee {entry ? dollars(Math.round((entry.totalFee ?? 0) * 100)) : ''} + a card
              processing fee, shown on the next screen before you send.
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        ) : (
          <div className="space-y-3 py-2">
            {/* Fee-on-top disclosure: exact server-computed breakdown. */}
            <div className="rounded-md border p-3 text-sm">
              <div className="flex justify-between">
                <span>Entry fees</span>
                <span>{dollars(result.subtotalCents)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Card processing fee</span>
                <span>{dollars(result.platformFeeCents)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t pt-1 font-medium">
                <span>Exhibitor pays</span>
                <span>{dollars(result.totalCents)}</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="payment-link">Payment link</Label>
              <div className="flex gap-2">
                <Input id="payment-link" readOnly value={result.url} onFocus={e => e.target.select()} />
                <Button type="button" variant="outline" onClick={handleCopy}>
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Send this link to the exhibitor. It expires in 24 hours — generate a new one if it
                lapses. Paying it marks the entry paid automatically.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {!result ? (
            <>
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button onClick={handleGenerate} disabled={submitting}>
                {submitting ? 'Generating…' : 'Generate link'}
              </Button>
            </>
          ) : (
            <Button onClick={() => handleOpenChange(false)}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Lifecycle states that aren't in the show — never collect money for these. */
const INACTIVE_ENTRY_STATUSES: ReadonlySet<EntryStatus> = new Set([
  EntryStatus.CANCELLED, // 'withdrawn'
  EntryStatus.SCRATCHED,
  EntryStatus.REJECTED, // 'not_accepted'
]);

/** An entry qualifies for the "Request payment" flow when it still owes money
 * AND is still active: payment_status='pending' covers both a mail-in entry and
 * a promoted waitlist entry (Task 1 finding); comped entries owe nothing; a
 * withdrawn/scratched/rejected entry isn't in the show. Server authz + the
 * club's payout-enabled check remain authoritative. */
export function isPaymentRequestable(
  entry: Pick<EntryManagementEntry, 'paymentStatus' | 'comped' | 'entryStatus'>
): boolean {
  return (
    entry.paymentStatus === PaymentStatus.PENDING &&
    !entry.comped &&
    !INACTIVE_ENTRY_STATUSES.has(entry.entryStatus)
  );
}
