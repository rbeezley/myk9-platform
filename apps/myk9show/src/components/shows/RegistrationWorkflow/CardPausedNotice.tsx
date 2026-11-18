import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cardPausedMessage } from '@/features/payments/cardPausedCopy';
import type { PaymentMethodResolution } from './PaymentStep/usePaymentMethodResolution';

/** The steps she fills in before paying. The payment step and the receipt say it themselves. */
const BEFORE_PAYMENT_STEPS: ReadonlySet<string> = new Set([
  'dog-selection',
  'class-selection',
  'handler-assignment',
]);

/**
 * MYK9-2166: told at the start of the entry, before she picks dogs and classes, that card payment
 * is paused for this show. It never blocks: check and cash entry carry on, and the message names
 * the ones this show takes. Staff keying entries do not pay by card, so `cardPaused` is false for
 * them and nothing shows.
 */
export function CardPausedNotice({
  resolution,
  stepId,
}: {
  resolution: Pick<PaymentMethodResolution, 'cardPaused' | 'acceptedMethods'>;
  stepId: string;
}) {
  if (!resolution.cardPaused || !BEFORE_PAYMENT_STEPS.has(stepId)) return null;
  return (
    <Alert className="mb-4" data-testid="card-paused-notice">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription>{cardPausedMessage(resolution.acceptedMethods)}</AlertDescription>
    </Alert>
  );
}
