// One show's payout, as the sentence a club reads (MYK9-1985). The wording and
// the dates live in features/payments/payoutStage.ts; this only renders them.
// No control on the row: the Bank account card above owns every bank action, and
// a sentence that needs the club points there (owner decision A, 2026-11-26).
import { AlertCircle } from 'lucide-react';
import type { PayoutStage } from '@/features/payments/payoutStage';

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

export function PayoutStageLine({ stage }: { stage: PayoutStage }) {
  const clubMustAct = stage.kind === 'failed-club';
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
    </div>
  );
}
