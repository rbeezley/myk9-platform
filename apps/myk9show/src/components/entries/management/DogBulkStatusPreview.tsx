import { useWithdrawalRefundPreview } from '@/features/payments/useWithdrawalRefundPreview';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { describeEntryRun, type DogBulkEligibility } from './dogBulkStatusEligibility';
import { isStripeRefundable } from './refundEligibility';

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** One entry's SUGGESTED refund, read-only. Nothing here issues, records or queues a refund. */
function SuggestedRefund({ entry }: { entry: EntryManagementEntry }) {
  const feeCents = Math.round((entry.totalFee ?? 0) * 100);
  const refundable = isStripeRefundable(entry);
  const { data, isLoading } = useWithdrawalRefundPreview(entry.id, feeCents, refundable);
  if (!refundable) {
    return <span className="text-muted-foreground">No online payment to refund</span>;
  }
  if (isLoading || !data) return <span className="text-muted-foreground">Checking policy…</span>;
  if (data.requiresManual) {
    return (
      <span className="text-muted-foreground">
        Amount set when you approve the refund (up to {dollars(feeCents)})
      </span>
    );
  }
  return <span>Suggested refund {dollars(data.refundCents)}</span>;
}

/** The entries a dog-level verb will not touch, named by trial and class. */
export function ExcludedEntries({ excluded }: Pick<DogBulkEligibility, 'excluded'>) {
  if (excluded.length === 0) return null;
  return (
    <div className="text-sm">
      <p className="font-medium">Left as they are</p>
      <ul className="max-h-32 list-disc overflow-y-auto pl-5 text-muted-foreground">
        {excluded.map(({ entry, label, reason }) => (
          <li key={entry.id}>
            {label} ({reason})
          </li>
        ))}
      </ul>
    </div>
  );
}

/** What Withdraw will change, with the per-entry suggested refund and no refund issued. */
export function WithdrawPreview({
  dogName,
  eligibility,
}: {
  dogName: string;
  eligibility: DogBulkEligibility;
}) {
  const count = eligibility.eligible.length;
  return (
    <div className="space-y-3">
      <p className="text-sm">
        Withdraw {dogName} from {count} {count === 1 ? 'entry' : 'entries'}. No refund is issued
        here; refunds are approved per entry afterwards.
      </p>
      <ul className="max-h-[40dvh] space-y-1 overflow-y-auto text-sm">
        {eligibility.eligible.map(entry => (
          <li key={entry.id} className="flex flex-col">
            <span className="font-medium">{describeEntryRun(entry)}</span>
            <SuggestedRefund entry={entry} />
          </li>
        ))}
      </ul>
      <ExcludedEntries excluded={eligibility.excluded} />
    </div>
  );
}
