// One show's payout, as the sentence a club reads (MYK9-1985). The wording and
// the dates live in features/payments/payoutStage.ts; this only renders them and
// the control that fixes the club's own problem.
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PayoutStage } from '@/features/payments/payoutStage';

export interface PayoutStageActions {
  /** Opens Stripe so the club can fix its bank account. */
  onFixBankAccount?: (() => void) | undefined;
  /** Takes the club to the Bank account card to connect one. */
  onConnectBankAccount?: (() => void) | undefined;
  /** A Stripe link is already being opened. */
  isOpeningStripe?: boolean | undefined;
}

/** The sent sentence with its day as a <time>, so a treasurer's tools can read the date. */
function SentSentence({
  stage,
  sentOn,
}: {
  stage: PayoutStage;
  sentOn: NonNullable<PayoutStage['sentOn']>;
}) {
  const at = stage.text.indexOf(sentOn.label);
  if (at < 0) return <>{stage.text}</>;
  return (
    <>
      {stage.text.slice(0, at)}
      <time dateTime={sentOn.dateTime}>{sentOn.label}</time>
      {stage.text.slice(at + sentOn.label.length)}
    </>
  );
}

export function PayoutStageLine({
  stage,
  onFixBankAccount,
  onConnectBankAccount,
  isOpeningStripe = false,
}: { stage: PayoutStage } & PayoutStageActions) {
  const clubMustAct = stage.action === 'fix-bank-account';
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="payout-stage">
      <p className="flex items-start gap-1.5 text-sm">
        {clubMustAct && (
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        )}
        <span>
          {stage.sentOn ? <SentSentence stage={stage} sentOn={stage.sentOn} /> : stage.text}
        </span>
      </p>
      {stage.action === 'fix-bank-account' && onFixBankAccount && (
        <Button
          variant="outline"
          size="touch"
          onClick={onFixBankAccount}
          disabled={isOpeningStripe}
        >
          {isOpeningStripe ? 'Opening Stripe' : 'Fix it'}
        </Button>
      )}
      {stage.action === 'connect-bank-account' && onConnectBankAccount && (
        <Button variant="outline" size="touch" onClick={onConnectBankAccount}>
          Connect bank account
        </Button>
      )}
    </div>
  );
}
