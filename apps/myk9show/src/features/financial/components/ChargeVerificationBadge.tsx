// Charge-verification badge (unified-financial-dashboard, MYK9-54, task 3.2).
// Renders the Verified / Attested vocabulary from chargeVerification.ts.
//
// Meaning lives in the TEXT, extended by an `sr-only` clause, never in an
// `aria-label`: Badge renders a role-less <div>, which maps to role="generic",
// and naming a generic element is PROHIBITED -- every aria-label on these
// badges was silently dropped by the accessibility tree.
// NEVER rendered for an unavailable/offline reconciliation fetch — the calling
// card must show the explicit "unavailable" state instead (docs/INTENT.md: a
// treasurer trusts the record, so a missing fact must read as missing, never
// green). Attested is a NEUTRAL state, not a warning: it means "recorded, but we
// hold no Stripe snapshot", which is the normal shape of a desk payment or a
// legacy order.
import { CheckCircle2, FileCheck, FileQuestion } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { NEUTRAL_STATUS_CHIP } from '@/components/ui/statusChip';
import type { ClubShowChargeVerification } from '../clubShowReconciliation';

interface ChargeVerificationBadgeProps {
  state: ClubShowChargeVerification;
}

export function ChargeVerificationBadge({ state }: ChargeVerificationBadgeProps) {
  if (state === 'Verified') {
    return (
      <Badge className="gap-1 bg-success text-success-foreground hover:bg-success">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        Verified
        <span className="sr-only"> against Stripe</span>
      </Badge>
    );
  }
  if (state === 'Attested') {
    return (
      <Badge variant="secondary" className={`gap-1 ${NEUTRAL_STATUS_CHIP}`}>
        <FileCheck className="h-3.5 w-3.5" aria-hidden="true" />
        Attested
        <span className="sr-only">, no Stripe snapshot on record</span>
      </Badge>
    );
  }
  // No order rows at all. Attested would be a claim about a charge we do not
  // hold, so the visible text carries the whole meaning -- deliberately not an
  // aria-label, which a role-less Badge drops anyway.
  return (
    <Badge variant="secondary" className={`gap-1 ${NEUTRAL_STATUS_CHIP}`}>
      <FileQuestion className="h-3.5 w-3.5" aria-hidden="true" />
      No charge record
    </Badge>
  );
}
