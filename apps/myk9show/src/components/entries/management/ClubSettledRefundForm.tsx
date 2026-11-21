import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { useIsOnline } from '@/hooks/useNetworkStatus';
import { logger } from '@/services/LoggingService';
import {
  ClubSettledRefundError,
  clubSettledRefundsQueryKey,
  listClubSettledRefunds,
  newClubRefundRetryKey,
  recordClubSettledRefund,
  reverseClubSettledRefund,
  type ClubRefundMethod,
  type ClubSettledRefundListRow,
} from '@/services/database/club-settled-refunds';
import type { RefundableEntry } from './RefundEntryDialog';
import {
  CLUB_REFUND_ERROR_MESSAGES,
  CLUB_REFUND_INTRO,
  CLUB_REFUND_OFFLINE,
  CLUB_REFUND_UNCONFIRMED,
} from './clubSettledRefundMessages';
import {
  centsToDollars,
  netClubRefundedCents,
  remainingBalanceCents,
} from './clubSettledRefundMoney';
import { dollarsToCents } from '@/features/financial/entryAccounting';
import { formatCents } from '@/lib/format/cents';
import { getTodayLocal } from '@/utils/dateLocal';

const METHODS: { value: ClubRefundMethod; label: string }[] = [
  { value: 'check', label: 'Check' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
];

function messageFor(err: unknown, context: string): string {
  const code = err instanceof ClubSettledRefundError ? err.code : undefined;
  const known = code ? CLUB_REFUND_ERROR_MESSAGES[code] : undefined;
  if (!known) logger.error(context, 'secretary', { code }, err instanceof Error ? err : undefined);
  return known ?? CLUB_REFUND_UNCONFIRMED;
}

interface ClubSettledRefundFormProps {
  entry: RefundableEntry;
  onClose: () => void;
  /** Called after a record or a reversal so the host reloads entries (badge, reports). */
  onChanged: () => void;
}

export function ClubSettledRefundForm({ entry, onClose, onChanged }: ClubSettledRefundFormProps) {
  const queryClient = useQueryClient();
  const isOnline = useIsOnline();
  // The ledger is keyed by the money root, as the card refund is.
  const moneyEntryId = entry.moneyRootEntryId ?? entry.id;

  const { data: rows, isError: rowsFailed } = useQuery({
    queryKey: clubSettledRefundsQueryKey(moneyEntryId),
    queryFn: () => listClubSettledRefunds(moneyEntryId),
    enabled: isOnline,
  });

  // The loaded ledger is fresher than the entry prop, which is stale until the host reloads.
  const clubRefundedCents = rows
    ? netClubRefundedCents(rows)
    : dollarsToCents(entry.clubRefundedAmount ?? 0);
  const remainingCents = remainingBalanceCents(
    entry.totalFee,
    entry.discountAmount,
    entry.refundAmount,
    clubRefundedCents
  );

  const [amount, setAmount] = useState<string | null>(null);
  const [paidOn, setPaidOn] = useState(getTodayLocal);
  const [method, setMethod] = useState<ClubRefundMethod>('check');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [reverseError, setReverseError] = useState<string | null>(null);
  // One retry key per submit attempt: a retry after a lost answer reuses it.
  const recordKeyRef = useRef<string | null>(null);
  const reverseKeysRef = useRef(new Map<string, string>());

  const shownAmount = amount ?? centsToDollars(remainingCents);
  const amountNumber = Number(shownAmount);
  const amountCents = Math.round(amountNumber * 100);
  // Save bypasses the native step and Number() accepts exponents, so the whole text must be
  // plain dollars with at most two decimal places (rejects 10.123, 15e-3, 1e2 and -5).
  const amountIsMalformed =
    shownAmount.trim() !== '' && !/^\d+(\.\d{1,2})?$/.test(shownAmount.trim());
  const amountValid =
    shownAmount.trim() !== '' &&
    !amountIsMalformed &&
    Number.isFinite(amountNumber) &&
    amountCents > 0 &&
    amountCents <= remainingCents;

  const record = useMutation({
    mutationFn: () => {
      recordKeyRef.current ??= newClubRefundRetryKey();
      return recordClubSettledRefund({
        entryId: moneyEntryId,
        amount: amountCents / 100,
        paidOn,
        method,
        reference: reference.trim(),
        note: note.trim(),
        clientRefundId: recordKeyRef.current,
      });
    },
    onSuccess: row => {
      recordKeyRef.current = null;
      toast.success(`Recorded ${formatCents(dollarsToCents(row.amount))} the club paid back.`);
      void queryClient.invalidateQueries({ queryKey: clubSettledRefundsQueryKey(moneyEntryId) });
      onChanged();
      onClose();
    },
    onError: err => {
      if (err instanceof ClubSettledRefundError && err.code) recordKeyRef.current = null;
      setError(messageFor(err, 'Club settled refund failed'));
    },
  });

  const reverse = useMutation({
    mutationFn: (row: ClubSettledRefundListRow) => {
      let key = reverseKeysRef.current.get(row.id);
      if (!key) {
        key = newClubRefundRetryKey();
        reverseKeysRef.current.set(row.id, key);
      }
      return reverseClubSettledRefund({ refundId: row.id, clientRefundId: key });
    },
    onSuccess: (_row, original) => {
      reverseKeysRef.current.delete(original.id);
      setConfirmingId(null);
      setReverseError(null);
      toast.success('Marked as a mistake. The amount is available again.');
      void queryClient.invalidateQueries({ queryKey: clubSettledRefundsQueryKey(moneyEntryId) });
      onChanged();
    },
    onError: (err, original) => {
      if (err instanceof ClubSettledRefundError && err.code) {
        reverseKeysRef.current.delete(original.id);
      }
      setReverseError(messageFor(err, 'Club settled refund reversal failed'));
    },
  });

  const reversedIds = new Set((rows ?? []).map(row => row.reverses_id).filter(Boolean));
  const payments = (rows ?? []).filter(row => row.reverses_id === null);
  const busy = record.isPending || reverse.isPending;
  const canSave = isOnline && amountValid && paidOn !== '' && !busy;

  return (
    <>
      <DialogHeader>
        <DialogTitle>The club paid this back</DialogTitle>
        <DialogDescription>{CLUB_REFUND_INTRO}</DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2">
        <p className="text-sm text-muted-foreground">
          {entry.dogName ?? 'This entry'}: {formatCents(remainingCents)} left to record.
        </p>

        <div className="space-y-1">
          <Label htmlFor="club-refund-amount">Amount (max {formatCents(remainingCents)})</Label>
          <Input
            id="club-refund-amount"
            type="number"
            min="0.01"
            max={remainingCents / 100}
            step="0.01"
            value={shownAmount}
            onChange={e => setAmount(e.target.value)}
          />
          {amountIsMalformed && (
            <p className="text-xs text-destructive">
              Enter dollars and cents (two decimal places).
            </p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="club-refund-date">Date paid</Label>
          <Input
            id="club-refund-date"
            type="date"
            value={paidOn}
            onChange={e => setPaidOn(e.target.value)}
          />
        </div>

        <fieldset className="space-y-1">
          <legend className="text-sm font-medium">How the club paid it</legend>
          <RadioGroup value={method} onValueChange={value => setMethod(value as ClubRefundMethod)}>
            {METHODS.map(option => (
              <div key={option.value} className="flex items-center space-x-2">
                <RadioGroupItem value={option.value} id={`club-refund-${option.value}`} />
                <Label htmlFor={`club-refund-${option.value}`}>{option.label}</Label>
              </div>
            ))}
          </RadioGroup>
        </fieldset>

        <div className="space-y-1">
          <Label htmlFor="club-refund-reference">Check number or reference (optional)</Label>
          <Input
            id="club-refund-reference"
            value={reference}
            onChange={e => setReference(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="club-refund-note">Note (optional)</Label>
          <Textarea
            id="club-refund-note"
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
          />
        </div>

        {!isOnline && <p className="text-sm text-muted-foreground">{CLUB_REFUND_OFFLINE}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        <section aria-label="Earlier club records" className="space-y-2 border-t pt-3">
          <h3 className="text-sm font-medium">Earlier records for this entry</h3>
          {rowsFailed && (
            <p className="text-xs text-muted-foreground">Earlier records could not be loaded.</p>
          )}
          {rows && payments.length === 0 && (
            <p className="text-xs text-muted-foreground">None yet.</p>
          )}
          {payments.map(row => {
            const reversed = reversedIds.has(row.id);
            return (
              <div key={row.id} className="rounded-md border p-2 text-sm">
                <p className={reversed ? 'text-muted-foreground line-through' : undefined}>
                  {formatCents(dollarsToCents(row.amount))} paid {row.paid_on}
                  {row.method ? ` by ${row.method}` : ''}
                  {row.reference ? `, ${row.reference}` : ''}
                </p>
                {row.note && <p className="text-xs text-muted-foreground">{row.note}</p>}
                {reversed ? (
                  <p className="text-xs text-muted-foreground">Marked as a mistake.</p>
                ) : confirmingId === row.id ? (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-xs">Mark this record as a mistake?</span>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={!isOnline || busy}
                      onClick={() => reverse.mutate(row)}
                    >
                      Yes, it was a mistake
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setConfirmingId(null)}>
                      Keep it
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-1 px-2 text-xs"
                    disabled={!isOnline || busy}
                    onClick={() => {
                      setReverseError(null);
                      setConfirmingId(row.id);
                    }}
                  >
                    This was a mistake…
                  </Button>
                )}
              </div>
            );
          })}
          {reverseError && <p className="text-sm text-destructive">{reverseError}</p>}
        </section>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={record.isPending}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            setError(null);
            record.mutate();
          }}
          disabled={!canSave}
        >
          {record.isPending ? 'Saving…' : 'Save record'}
        </Button>
      </DialogFooter>
    </>
  );
}
