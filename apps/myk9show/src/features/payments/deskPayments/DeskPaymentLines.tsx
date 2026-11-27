import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { deskPaymentLineText } from './deskPaymentCopy';
import { useDeskPaymentLines } from './useDeskPaymentLines';

interface DeskPaymentLinesProps {
  showId: string | undefined;
  enrollmentId: string | null | undefined;
}

/**
 * MYK9-2479: this form's cash and check payments that live on this device, under the
 * form's balance. The balance stays the server's figure; nothing here is added to it.
 * While a payment is queued it promises an automatic send and offers nothing to press.
 * Stopped, it says it will not send on its own and offers Try again (the same payment,
 * the same id). Only a proven refusal offers Remove.
 */
export function DeskPaymentLines({ showId, enrollmentId }: DeskPaymentLinesProps) {
  const { lines, busyId, tryAgain, remove } = useDeskPaymentLines(showId, enrollmentId);
  if (lines.length === 0) return null;
  return (
    <ul className="mt-2 w-full space-y-1" aria-label="Payments on this device">
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
              disabled={busyId !== null}
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
              disabled={busyId !== null}
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
