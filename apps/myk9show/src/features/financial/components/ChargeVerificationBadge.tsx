// Charge-verification badge (unified-financial-dashboard, MYK9-54, task 3.2).
// Renders the Verified / Attested / Mismatch vocabulary from
// chargeVerification.ts. NEVER rendered for an unavailable/offline
// reconciliation fetch — the calling card must show the explicit
// "unavailable" state instead (docs/INTENT.md: a treasurer trusts the
// record, so a missing fact must read as missing, never green).
import { CheckCircle2, FileCheck, AlertTriangle } from 'lucide-react';
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
  if (state === 'Mismatch') {
    return (
      <Badge
        aria-label="Charge verification: Mismatch, needs a look"
        variant="destructive"
        className="gap-1"
      >
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        Mismatch
      </Badge>
    );
  }
  return (
    <Badge
      aria-label="Charge verification: Attested, no Stripe trace"
      variant="secondary"
      className="gap-1"
    >
      <FileCheck className="h-3.5 w-3.5" aria-hidden="true" />
      Attested
    </Badge>
  );
}
