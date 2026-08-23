// Charge-coverage badge (unified-financial-dashboard, MYK9-54, task 3.2).
// Renders the show-level coverage vocabulary from clubShowReconciliation.ts.
//
// THE LABEL MAY NOT OUTRUN THE RESOLVER (MYK9-230). These badges read
// "Verified" / "Attested", and the Verified one carried an sr-only " against
// Stripe". What the resolver behind them tests is whether both fee-snapshot
// columns (entry_subtotal_cents, platform_fee_cents) are non-null. It does not
// call Stripe, does not compare amounts, and cannot know whether the club was
// paid. "Verified against Stripe" claimed a check that never happens -- and
// #1723, by correctly converting a dropped aria-label into sr-only text,
// promoted that latent overclaim into one a screen reader actually speaks, to
// the audience least able to cross-check it.
//
// TWO TRAPS THE FIRST REWRITE FELL INTO, both caught in review, both recorded
// because the replacement wording looked fine until you know them:
//
//   1. THIS IS A COVERAGE STATEMENT, NOT A ROW FACT. One order without a fee
//      snapshot degrades the WHOLE show (clubShowReconciliation.ts). A flat
//      "No Stripe record on file" is therefore FALSE for a show with fifty
//      snapshotted orders and one without -- a definite, checkable, wrong claim,
//      which is worse than the vague word it replaced. "Some charges" survives
//      the aggregation truthfully.
//   2. A MISSING SNAPSHOT IS NOT A MISSING CHARGE. Both columns land NULL for a
//      real Stripe charge whenever an accepted entry has no fee
//      (resolveAcceptedEntrySnapshot returns 'unverifiable'), and a show with no
//      stripe_orders rows at all may still hold thousands of dollars taken by
//      check at the desk. Neither may be rendered as "no charge".
//
// Meaning lives entirely in the VISIBLE TEXT, never in an `aria-label`: Badge
// renders a role-less <div>, which maps to role="generic", and naming a generic
// element is PROHIBITED -- every aria-label on these badges was silently
// dropped by the accessibility tree. There is no `sr-only` extension either:
// those existed to qualify labels too short to be honest, and these carry their
// own meaning, so sighted and screen-reader users receive the identical claim.
//
// ALL THREE STATES ARE NEUTRAL. Coverage is not pass/fail. The green
// `bg-success` chip was itself the "verified" claim -- a treasurer reads colour
// before text, so neutral words in a green chip still say "this one passed" and
// leave the grey rows reading as the ones that did not. On this card colour is
// reserved for `Needs attention`, the one state that genuinely wants the eye.
//
// NEVER rendered for an unavailable/offline reconciliation fetch -- the calling
// card must show the explicit "unavailable" state instead (docs/INTENT.md: a
// treasurer trusts the record, so a missing fact must read as missing).
import { FileCheck, FileQuestion, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { NEUTRAL_STATUS_CHIP } from '@/components/ui/statusChip';
import type { ClubShowChargeVerification } from '../clubShowReconciliation';

interface ChargeVerificationBadgeProps {
  state: ClubShowChargeVerification;
}

export function ChargeVerificationBadge({ state }: ChargeVerificationBadgeProps) {
  if (state === 'AllFeeBreakdowns') {
    return (
      <Badge variant="secondary" className={`gap-1 ${NEUTRAL_STATUS_CHIP}`}>
        <FileCheck className="h-3.5 w-3.5" aria-hidden="true" />
        Stripe fee breakdown for every charge
      </Badge>
    );
  }
  if (state === 'SomeFeeBreakdownsMissing') {
    // FileText, not FileCheck: a document-with-a-checkmark in front of a label
    // about something missing contradicts the label.
    return (
      <Badge variant="secondary" className={`gap-1 ${NEUTRAL_STATUS_CHIP}`}>
        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
        Some charges have no Stripe fee breakdown
      </Badge>
    );
  }
  // No stripe_orders rows. Says what is absent -- Stripe charges -- and not
  // that no money was taken.
  return (
    <Badge variant="secondary" className={`gap-1 ${NEUTRAL_STATUS_CHIP}`}>
      <FileQuestion className="h-3.5 w-3.5" aria-hidden="true" />
      No Stripe charges
    </Badge>
  );
}
