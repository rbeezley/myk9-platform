// Stripe dashboard link-out for a transfer (unified-financial-dashboard,
// MYK9-54, task 3.2). Opens the Stripe dashboard's transfer detail page in a
// new tab — a "Regular" action (external navigation, no data submitted), so
// no confirmation gate is needed. Same-origin/session rules from
// docs/INTENT.md apply only to in-app ringside navigation, not this external
// reference link.
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { stripeTransferDashboardUrl } from '../stripeDashboardUrl';

interface StripeLinkOutProps {
  transferId: string;
}

export function StripeLinkOut({ transferId }: StripeLinkOutProps) {
  return (
    <Button variant="ghost" size="sm" className="h-auto gap-1.5 px-2 py-1 text-xs" asChild>
      <a
        href={stripeTransferDashboardUrl(transferId)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`View transfer ${transferId} in Stripe`}
      >
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        View in Stripe
      </a>
    </Button>
  );
}
