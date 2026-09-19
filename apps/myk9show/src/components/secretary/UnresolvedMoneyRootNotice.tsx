import { AlertTriangle } from 'lucide-react';

interface UnresolvedMoneyRootNoticeProps {
  /** `unresolvedMoneyRootCount` from `resolveShowFinancialRows`. */
  count: number;
  /**
   * What the reader should do about it. The per-trial card and the show card
   * have different answers, and "run it at show scope" is nonsense on the show
   * card.
   */
  remedy: string;
}

/**
 * Says out loud that some of the money below is missing (MYK9-639).
 *
 * A move-up leaves the fee on the entry the exhibitor paid for and puts the run
 * in the destination class. When the two are in different scopes — a Trial 1 →
 * Trial 2 move-up, which the target picker offers by design — the fee is
 * outside this card's array, so the run shows at $0. It is also what a
 * superseded row nobody claims looks like.
 *
 * `moneyRoot.ts` computes this on every call and the Financial Report has
 * always rendered it; both secretary summaries used to destructure it away,
 * which is how $35 could vanish from a trial card in silence. Silence is the
 * failure mode this whole change exists to end, so the notice is a shared
 * component rather than three near-copies.
 */
export function UnresolvedMoneyRootNotice({ count, remedy }: UnresolvedMoneyRootNoticeProps) {
  if (count <= 0) return null;

  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        {count === 1
          ? '1 entry was moved up from outside this view, so its fee and payment are not included below.'
          : `${count} entries were moved up from outside this view, so their fees and payments are not included below.`}{' '}
        {remedy}
      </p>
    </div>
  );
}
