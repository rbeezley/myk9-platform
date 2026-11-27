import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DESK_PAYMENTS_UNREADABLE, deskPaymentLineText } from './deskPaymentCopy';
import type { DeskPaymentLinesState } from './useDeskPaymentLines';

type DeskPaymentLinesProps = Pick<
  DeskPaymentLinesState,
  'lines' | 'busyId' | 'unreadable' | 'tryAgain' | 'remove'
>;

/**
 * MYK9-2479: this form's cash and check payments that live on this device, under the
 * form's balance. The balance stays the server's figure; nothing here is added to it.
 * While a payment is queued it promises an automatic send and offers nothing to press.
 * Stopped, it says it will not send on its own and offers Try again (the same payment,
 * the same id). Only a proven refusal offers Remove. When the device cannot read its
 * saved payments it says so, keeps what it last knew, and offers nothing to press.
 * The state is the form's own (`useEnrollmentDialogControls`), which Paid in Full reads too.
 */
export function DeskPaymentLines({
  lines,
  busyId,
  unreadable,
  tryAgain,
  remove,
}: DeskPaymentLinesProps) {
  if (lines.length === 0 && !unreadable) return null;
  const actionsOff = busyId !== null || unreadable;
  return (
    <ul className="mt-2 w-full space-y-1" aria-label="Payments on this device">
      {unreadable && (
        <li
          role="alert"
          className="text-xs text-destructive"
          data-testid="desk-payments-unreadable"
        >
          {DESK_PAYMENTS_UNREADABLE}
        </li>
      )}
      {lines.map(line => (
        <li
          key={line.payment.id}
          data-testid="desk-payment-line"
          data-state={line.state}
          className={cn(
            'flex flex-wrap items-center gap-2 text-xs',
            line.state === 'refused' ? 'text-destructive' : 'text-warning'
          )}
        >
          <span>{deskPaymentLineText(line)}</span>
          {(line.state === 'unconfirmed-stopped' || line.state === 'not-checked') && (
            <Button
              size="sm"
              variant="outline"
              className="min-h-11"
              disabled={actionsOff}
              onClick={() => tryAgain(line)}
            >
              Try again
            </Button>
          )}
          {line.state === 'refused' && (
            <Button
              size="sm"
              variant="outline"
              className="min-h-11"
              disabled={actionsOff}
              onClick={() => remove(line)}
            >
              Remove
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
