import { Badge } from '@/components/ui/badge';
import { formatCents } from '@/lib/format/cents';
import { dollarsToCents } from '@/features/financial/entryAccounting';
import type { EntryManagementEntry } from '@/types/entry-management-types';

/**
 * MYK9-2303: money the club paid the exhibitor directly after the payout. The
 * entry stays paid by card and never reads "Refunded" (the card word).
 */
export function ClubRefundBadge({
  entry,
}: {
  entry: Pick<EntryManagementEntry, 'clubRefundedAmount'>;
}) {
  const amount = entry.clubRefundedAmount ?? 0;
  if (!(amount > 0)) return null;
  return (
    <Badge variant="outline">Refunded by the club {formatCents(dollarsToCents(amount))}</Badge>
  );
}
