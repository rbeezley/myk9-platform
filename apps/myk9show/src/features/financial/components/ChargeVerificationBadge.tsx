// Charge-verification badge (unified-financial-dashboard, MYK9-54, task 3.2).
// Renders the Verified / Attested vocabulary from chargeVerification.ts.
// NEVER rendered for an unavailable/offline reconciliation fetch — the calling
// card must show the explicit "unavailable" state instead (docs/INTENT.md: a
// treasurer trusts the record, so a missing fact must read as missing, never
// green). Attested is a NEUTRAL state, not a warning: it means "recorded, but we
// hold no Stripe snapshot", which is the normal shape of a desk payment or a
// legacy order.
import { CheckCircle2, FileCheck, FileQuestion } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ClubShowChargeVerification } from '../clubShowReconciliation';

interface ChargeVerificationBadgeProps {
  state: ClubShowChargeVerification;
}

export function ChargeVerificationBadge({ state }: ChargeVerificationBadgeProps) {
  if (state === 'Verified') {
    return (
      <Badge
        aria-label="Charge verification: Verified against Stripe"
        className="gap-1 bg-success text-success-foreground hover:bg-success"
      >
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        Verified
      </Badge>
    );
  }
  if (state === 'Attested') {
    return (
      <Badge
        aria-label="Charge verification: Attested, no Stripe snapshot on record"
        variant="secondary"
        className="gap-1"
      >
        <FileCheck className="h-3.5 w-3.5" aria-hidden="true" />
        Attested
      </Badge>
    );
  }
  // No order rows at all. Attested would be a claim about a charge we do not
  // hold, so the visible text carries the whole meaning -- deliberately not an
  // aria-label, which a role-less Badge drops anyway.
  return (
    <Badge variant="secondary" className="gap-1">
      <FileQuestion className="h-3.5 w-3.5" aria-hidden="true" />
      No charge record
    </Badge>
  );
}
