import { useEffect, useRef, useState } from 'react';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase';
import { useWithdrawalRefundSuggestion } from '@/features/payments/useWithdrawalRefundSuggestion';
import type { EntryManagementEntry } from '@/types/entry-management-types';

// Server validation is authoritative; these map its error codes to language a
// secretary can act on.
const ERROR_MESSAGES: Record<string, string> = {
  payout_already_sent:
    'This show’s entry fees have already been paid out to the club. Settle this refund directly with the club.',
  payout_in_progress: 'A payout to the club is in flight. Try again after it completes.',
  not_refundable: 'This entry has no refundable payment (it may already be refunded).',
  not_online_payment: 'This entry wasn’t paid online. Refund it the way it was paid.',
  missing_payment_intent: 'This entry predates online payments and can’t be refunded through Stripe.',
  amount_exceeds_fee: 'The refund can’t exceed the entry fee.',
  invalid_amount: 'Enter a refund amount greater than zero.',
};

/** Minimal shape required by RefundEntryDialog — a subset of EntryManagementEntry. */
export type RefundableEntry = Pick<EntryManagementEntry, 'id' | 'totalFee' | 'dogName'>;

interface RefundEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: RefundableEntry | null;
  /** Called after a successful refund so the host can reload entries. */
  onRefunded: () => void;
}

export function RefundEntryDialog({ open, onOpenChange, entry, onRefunded }: RefundEntryDialogProps) {
  const [mode, setMode] = useState<'full' | 'partial'>('full');
  const [partialAmount, setPartialAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlightRef = useRef(false);

  const fee = entry?.totalFee ?? 0;
  const feeCents = Math.round(fee * 100);

  // Suggested refund from the policy snapshotted at payment (Phase 3b) — advisory.
  const { data: suggestion } = useWithdrawalRefundSuggestion(entry?.id, feeCents, open);
  const prefilledRef = useRef(false);

  // Pre-fill the suggested amount once per open. Never clobber in-progress edits,
  // and never auto-select for a prose-only/unset policy (requiresManual) — there
  // the secretary makes the call.
  useEffect(() => {
    if (!open) {
      prefilledRef.current = false;
      return;
    }
    if (prefilledRef.current || !suggestion?.hasPolicy || suggestion.requiresManual) return;
    prefilledRef.current = true;
    if (suggestion.refundCents < feeCents) {
      setMode('partial');
      setPartialAmount((suggestion.refundCents / 100).toFixed(2));
    }
  }, [open, suggestion, feeCents]);

  const policyMessage = !suggestion?.hasPolicy
    ? null
    : suggestion.reason === 'after_cutoff'
      ? `Withdrawal policy: past the refund cutoff. $${(suggestion.retainedCents / 100).toFixed(2)} is retained. Suggested refund $${(suggestion.refundCents / 100).toFixed(2)} (override below if needed).`
      : suggestion.reason === 'before_cutoff'
        ? 'Withdrawal policy: within the full-refund window. Full refund suggested.'
        : 'A withdrawal policy was recorded at payment, but the amount needs your judgment. Set it below.';

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setMode('full');
      setPartialAmount('');
      setNotes('');
      setError(null);
    }
    onOpenChange(nextOpen);
  };

  const handleRefund = async () => {
    if (!entry || inFlightRef.current) return;

    let amountCents: number | undefined;
    if (mode === 'partial') {
      const dollars = Number(partialAmount);
      if (!Number.isFinite(dollars) || dollars <= 0) {
        setError(ERROR_MESSAGES.invalid_amount);
        return;
      }
      if (dollars > fee) {
        setError(ERROR_MESSAGES.amount_exceeds_fee);
        return;
      }
      amountCents = Math.round(dollars * 100);
    }

    inFlightRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('stripe-refund-entry', {
        body: {
          entry_id: entry.id,
          amount_cents: amountCents,
          notes: notes.trim() || undefined,
        },
      });

      if (invokeError) {
        // Edge functions return validation codes in the response body; the
        // supabase client surfaces non-2xx as FunctionsHttpError with context.
        let code: string | undefined;
        const context = (invokeError as { context?: Response }).context;
        if (context) {
          try {
            code = (await context.json())?.error;
          } catch {
            // fall through to generic message
          }
        }
        setError(ERROR_MESSAGES[code ?? ''] ?? invokeError.message ?? 'Refund failed');
        return;
      }

      const refundedDollars = ((data?.amount_cents ?? 0) / 100).toFixed(2);
      toast.success(`Refunded $${refundedDollars} to the exhibitor's card.`);
      handleOpenChange(false);
      onRefunded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refund failed');
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Refund entry payment</DialogTitle>
          <DialogDescription>
            {entry
              ? `${entry.dogName ?? 'This entry'}: $${fee.toFixed(2)} paid online. The platform fee is not refunded. Refunds can only be issued once per entry.`
              : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {policyMessage && (
            <p className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
              {policyMessage}
            </p>
          )}

          <RadioGroup value={mode} onValueChange={value => setMode(value as 'full' | 'partial')}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="full" id="refund-full" />
              <Label htmlFor="refund-full">Full refund: ${fee.toFixed(2)}</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="partial" id="refund-partial" />
              <Label htmlFor="refund-partial">Partial amount</Label>
            </div>
          </RadioGroup>

          {mode === 'partial' && (
            <div className="space-y-1">
              <Label htmlFor="refund-amount">Amount (max ${fee.toFixed(2)})</Label>
              <Input
                id="refund-amount"
                type="number"
                min="0.01"
                max={fee}
                step="0.01"
                value={partialAmount}
                onChange={e => setPartialAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="refund-notes">Notes (optional)</Label>
            <Textarea
              id="refund-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Reason or reference for the club's records"
              rows={2}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleRefund} disabled={submitting}>
            {submitting ? 'Refunding…' : 'Issue refund'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
