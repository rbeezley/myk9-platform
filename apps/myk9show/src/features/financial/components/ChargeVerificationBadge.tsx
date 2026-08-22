// Charge-verification badge (unified-financial-dashboard, MYK9-54, task 3.2).
// Renders the vocabulary from chargeVerification.ts.
//
// THE LABEL MAY NOT OUTRUN THE RESOLVER (MYK9-230). These badges used to read
// "Verified" / "Attested", and the Verified one carried an sr-only " against
// Stripe". The resolver behind it tests one thing: whether both Stripe snapshot
// columns are non-null. It does not compare amounts, does not call Stripe, and
// cannot know whether the club was paid. "Verified against Stripe" claimed a
// check that never happens -- and #1723, by correctly converting a dropped
// aria-label into sr-only text, promoted that latent overclaim into one a
// screen reader actually speaks, to the audience least able to cross-check it.
// So the words now say exactly what is on file. If the resolver ever gains a
// real Stripe-side comparison, the label may grow to match it -- not before.
//
// Meaning lives entirely in the VISIBLE TEXT, never in an `aria-label`: Badge
// renders a role-less <div>, which maps to role="generic", and naming a generic
// element is PROHIBITED -- every aria-label on these badges was silently
// dropped by the accessibility tree. There is no `sr-only` extension any more
// either: the extensions existed to qualify labels that were too short to be
// honest, and the labels now carry their own meaning, so sighted and screen-
// reader users receive the identical claim.
// NEVER rendered for an unavailable/offline reconciliation fetch — the calling
// card must show the explicit "unavailable" state instead (docs/INTENT.md: a
// treasurer trusts the record, so a missing fact must read as missing, never
// green). "No Stripe record on file" is a NEUTRAL state, not a warning: it is
// the normal shape of a desk payment or a legacy order, which is why it keeps
// the neutral chip and never the destructive one.
import { CheckCircle2, FileCheck, FileQuestion } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { NEUTRAL_STATUS_CHIP } from '@/components/ui/statusChip';
import type { ClubShowChargeVerification } from '../clubShowReconciliation';

interface ChargeVerificationBadgeProps {
  state: ClubShowChargeVerification;
}

export function ChargeVerificationBadge({ state }: ChargeVerificationBadgeProps) {
  if (state === 'StripeRecord') {
    return (
      <Badge className="gap-1 bg-success text-success-foreground hover:bg-success">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        Stripe record on file
      </Badge>
    );
  }
  if (state === 'NoStripeRecord') {
    return (
      <Badge variant="secondary" className={`gap-1 ${NEUTRAL_STATUS_CHIP}`}>
        <FileCheck className="h-3.5 w-3.5" aria-hidden="true" />
        No Stripe record on file
      </Badge>
    );
  }
  // No order rows at all -- distinct from having orders with no Stripe
  // snapshot. "No charge record" says there is nothing to reconcile; "No Stripe
  // record on file" says there is a charge, recorded elsewhere.
  return (
    <Badge variant="secondary" className={`gap-1 ${NEUTRAL_STATUS_CHIP}`}>
      <FileQuestion className="h-3.5 w-3.5" aria-hidden="true" />
      No charge record
    </Badge>
  );
}
