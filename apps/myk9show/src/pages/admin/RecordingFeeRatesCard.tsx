/**
 * MYK9-2044: the registry recording fee, as a dated rate list beside the platform fee.
 *
 * The AKC recording fee the premium states and the Trial Secretary Report charges is the row
 * whose effective date is the latest on or before the show's date, so a rate change is a new
 * row here with no deploy. List and add only: past rows are history the reports price from.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { CalendarClock } from 'lucide-react';
import { formatRecordingFeeAmount, type RecordingFeeRate } from '@myk9/core';
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { useRecordingFeeRates } from '@/hooks/queries/useRecordingFeeRates';
import {
  DUPLICATE_RECORDING_FEE_CODE,
  RECORDING_FEE_REGISTRIES,
  parseRecordingFeeDollars,
  useAddRecordingFeeRate,
  type RecordingFeeRegistry,
} from '@/features/payments/useAddRecordingFeeRate';
import { formatLongDate } from '@/lib/format/dates';

/** An effective year outside this range is a typo (2207 for 2027), not a plan. */
const EARLIEST_EFFECTIVE_YEAR = 2020;
const LATEST_EFFECTIVE_YEAR = 2100;

function sortedNewestFirst(rates: readonly RecordingFeeRate[]): RecordingFeeRate[] {
  return [...rates].sort(
    (a, b) => a.registry.localeCompare(b.registry) || b.effectiveFrom.localeCompare(a.effectiveFrom)
  );
}

export function RecordingFeeRatesCard() {
  const query = useRecordingFeeRates(true);
  const addRate = useAddRecordingFeeRate();
  const [registry, setRegistry] = useState<RecordingFeeRegistry>('AKC');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [dollars, setDollars] = useState('');
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(
    null
  );
  const [confirming, setConfirming] = useState(false);

  // The list is read as fact only when this read succeeded: a copy cached on this device, or a
  // paused read, must not let an admin add a row against a list they cannot see.
  const unavailable = query.isError || query.fetchStatus === 'paused';
  const loading = !unavailable && (query.isPending || query.isFetching) && query.data === undefined;
  const rates = !unavailable && query.data ? sortedNewestFirst(query.data) : null;
  // The cached copy shows at once, but a row is added only against the list this visit read
  // from the server: the read has landed (an epoch `dataUpdatedAt` is the cached seed) and no
  // refetch is still in flight.
  const listIsLive = rates !== null && query.dataUpdatedAt > 0 && !query.isFetching;

  const amountCents = parseRecordingFeeDollars(dollars);
  const dateInvalid = !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom);
  const year = dateInvalid ? null : Number(effectiveFrom.slice(0, 4));
  const yearOutOfRange =
    year !== null && (year < EARLIEST_EFFECTIVE_YEAR || year > LATEST_EFFECTIVE_YEAR);
  const amountInvalid = amountCents === null;
  const canAdd =
    listIsLive && !dateInvalid && !yearOutOfRange && !amountInvalid && !addRate.isPending;
  const confirmTitle =
    amountCents === null
      ? ''
      : `Add $${formatRecordingFeeAmount(amountCents)} per entry for ${registry} from ${formatLongDate(effectiveFrom)}?`;

  const handleAdd = () => {
    if (amountCents === null) return;
    addRate.mutate(
      { registry, effectiveFrom, amountCents },
      {
        onSuccess: saved => {
          const message = `${saved.registry} recording fee set to $${formatRecordingFeeAmount(saved.amountCents)} per entry from ${formatLongDate(saved.effectiveFrom)}`;
          setFeedback({ tone: 'success', message });
          toast.success(message);
          setEffectiveFrom('');
          setDollars('');
        },
        onError: error => {
          const duplicate =
            (error as Error & { code?: string }).code === DUPLICATE_RECORDING_FEE_CODE;
          const message = duplicate
            ? `${registry} already has a rate from that date. Pick a different effective date.`
            : 'Could not add the rate. Try again.';
          setFeedback({ tone: 'error', message });
          toast.error(message);
        },
      }
    );
  };

  const guidance = dateInvalid
    ? 'Pick the date the new rate takes effect.'
    : yearOutOfRange
      ? `The effective date must be in a year from ${EARLIEST_EFFECTIVE_YEAR} to ${LATEST_EFFECTIVE_YEAR}. Check the year.`
      : amountInvalid
        ? 'Enter the per-entry amount in dollars and cents, such as 5.50.'
        : !listIsLive
          ? 'Checking the current rate list before a rate can be added.'
          : null;

  return (
    <Card>
      <CardHeader>
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <CalendarClock aria-hidden className="h-5 w-5" />
          Registry recording fee
        </h3>
        <CardDescription className="max-w-3xl leading-relaxed">
          The per-entry fee the registry charges, by the date it takes effect. A premium states the
          AKC rate in force on each of its trial dates, and the AKC Trial Secretary Report bills the
          rate in force on the trial date. A date with no rate prints no fee line and the report
          refuses to price. A change is a new row; no deployment is needed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : unavailable ? (
          <p role="alert" className="text-sm text-destructive">
            The rate list could not be loaded, so it cannot be changed here. Restart the app to try
            again.
          </p>
        ) : rates && rates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No recording fee rates are set. Premiums print no recording fee line and the Trial
            Secretary Report cannot price a trial until one is added.
          </p>
        ) : (
          rates && (
            <ul
              aria-label="Recording fee rates"
              className="divide-y divide-border rounded-lg border"
            >
              {rates.map(rate => (
                <li
                  key={`${rate.registry}-${rate.effectiveFrom}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">{rate.registry}</span> from{' '}
                    {formatLongDate(rate.effectiveFrom)}
                  </span>
                  <span className="tabular-nums">
                    ${formatRecordingFeeAmount(rate.amountCents)} per entry
                  </span>
                </li>
              ))}
            </ul>
          )
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="recording-fee-registry">Registry</Label>
            <select
              id="recording-fee-registry"
              value={registry}
              onChange={event => {
                setRegistry(event.target.value as RecordingFeeRegistry);
                setFeedback(null);
              }}
              disabled={rates === null}
              className="min-h-11 rounded-md border border-input bg-background px-3 py-2 text-base"
            >
              {RECORDING_FEE_REGISTRIES.map(option => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="recording-fee-date">Effective from</Label>
            <Input
              id="recording-fee-date"
              type="date"
              value={effectiveFrom}
              onChange={event => {
                setEffectiveFrom(event.target.value);
                setFeedback(null);
              }}
              aria-describedby="recording-fee-guidance"
              disabled={rates === null}
              className="h-11 w-44"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="recording-fee-amount">Amount per entry</Label>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">$</span>
              <Input
                id="recording-fee-amount"
                type="text"
                inputMode="decimal"
                value={dollars}
                onChange={event => {
                  setDollars(event.target.value);
                  setFeedback(null);
                }}
                aria-invalid={dollars !== '' && amountInvalid}
                aria-describedby="recording-fee-guidance"
                disabled={rates === null}
                className="h-11 w-28"
              />
            </div>
          </div>
          <Button className="min-h-11" onClick={() => setConfirming(true)} disabled={!canAdd}>
            {addRate.isPending ? 'Adding rate…' : 'Add rate'}
          </Button>
        </div>
        <p id="recording-fee-guidance" className="text-sm text-muted-foreground">
          {rates === null ? '' : guidance}
        </p>
        {feedback && (
          <p
            role={feedback.tone === 'error' ? 'alert' : 'status'}
            className={
              feedback.tone === 'error' ? 'text-sm text-destructive' : 'text-sm text-success'
            }
          >
            {feedback.message}
          </p>
        )}
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={confirmTitle}
          description="Premiums and Trial Secretary Reports for dates on or after it use this rate. Rates already listed stay as they are."
          confirmLabel="Add this rate"
          onConfirm={handleAdd}
        />
      </CardContent>
    </Card>
  );
}
