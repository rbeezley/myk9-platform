import { Button } from '@/components/ui/button';
import { describeEntryRun, type DogBulkEligibility } from './dogBulkStatusEligibility';
import type { WithdrawRefundOutcome } from './withdrawRefundOutcome';

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** One entry's SUGGESTED refund, read-only. Nothing here issues, records or queues a refund. */
function SuggestedRefund({ outcome }: { outcome: WithdrawRefundOutcome }) {
  switch (outcome.kind) {
    case 'no-online-payment':
      return <span className="text-muted-foreground">No online payment to refund</span>;
    case 'checking':
      return <span className="text-muted-foreground">Checking policy…</span>;
    case 'failed':
      return <span className="text-destructive">Couldn't check the refund policy</span>;
    case 'at-approval':
      return (
        <span className="text-muted-foreground">
          {outcome.chosen
            ? `Refund set when you approve it (up to ${dollars(outcome.maxCents)})`
            : `Amount set when you approve the refund (up to ${dollars(outcome.maxCents)})`}
        </span>
      );
    case 'suggested':
      return <span>Suggested refund {dollars(outcome.refundCents)}</span>;
  }
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
  outcomes,
  onRetry,
  onRefundsAtApproval,
}: {
  dogName: string;
  eligibility: DogBulkEligibility;
  /** One per eligible entry, in the same order. */
  outcomes: readonly WithdrawRefundOutcome[];
  onRetry: () => void;
  onRefundsAtApproval: () => void;
}) {
  const count = eligibility.eligible.length;
  const anyFailed = outcomes.some(o => o.kind === 'failed');
  return (
    <div className="space-y-3">
      <p className="text-sm">
        Withdraw {dogName} from {count} {count === 1 ? 'entry' : 'entries'}. No refund is issued
        here; refunds are approved per entry afterwards.
      </p>
      <ul className="max-h-[40dvh] space-y-1 overflow-y-auto text-sm">
        {eligibility.eligible.map((entry, i) => (
          <li key={entry.id} className="flex flex-col">
            <span className="font-medium">{describeEntryRun(entry)}</span>
            <SuggestedRefund outcome={outcomes[i] ?? { kind: 'checking' }} />
          </li>
        ))}
      </ul>
      {anyFailed && (
        <div role="alert" className="space-y-2 rounded-md border border-destructive/40 p-3 text-sm">
          <p>
            The refund policy could not be read, so no refund can be suggested yet. Try again, or
            withdraw now and set each refund when you approve it.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={onRetry}>
              Try again
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={onRefundsAtApproval}
            >
              Set refunds when approving
            </Button>
          </div>
        </div>
      )}
      <ExcludedEntries excluded={eligibility.excluded} />
    </div>
  );
}
