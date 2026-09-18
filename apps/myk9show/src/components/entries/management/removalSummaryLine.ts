/**
 * MYK9-632: one sentence for a row an exhibitor has left.
 *
 * Says WHICH act happened, WHY (for a withdrawal), and what is true about the
 * money RIGHT NOW. The last part is the point: a card that keeps saying "refund
 * at the club's discretion" after the club has already refunded or denied is
 * telling the secretary the decision is still open, and invites a second refund
 * on the same entry. It is also why a codeless withdrawal says nothing about
 * money at all — see the note at the bottom of `removalSummaryLine`.
 *
 * Own module so `EntryListCard.tsx` keeps exporting only components
 * (react-refresh/only-export-components) and so the wording is testable without
 * rendering the card.
 */
import { withdrawalReasonLabel } from '@/features/registries';
import type { EntryManagementEntry } from '@/types/entry-management-types';

type RemovalSummaryEntry = Pick<
  EntryManagementEntry,
  'withdrawalReason' | 'withdrawalReasonCode' | 'refundAmount' | 'refundedAt' | 'refundDecision'
> & { entryStatus?: unknown; rawEntryStatus?: string | null };

function isWithdrawal(entry: RemovalSummaryEntry): boolean {
  if (entry.rawEntryStatus === 'withdrawn') return true;
  if (entry.rawEntryStatus === 'scratched') return false;
  // Fall back to the reason code: only a withdrawal ever carries one.
  return withdrawalReasonLabel(entry.withdrawalReasonCode) !== null;
}

/** What the money is doing, or null while nobody has decided anything yet. */
function refundState(entry: RemovalSummaryEntry): string | null {
  if ((entry.refundAmount ?? 0) > 0 || entry.refundedAt) return 'refund issued';
  if (entry.refundDecision === 'denied') return 'refund denied';
  return null;
}

export function removalSummaryLine(entry: RemovalSummaryEntry): string {
  const withdrawal = isWithdrawal(entry);
  const reason = withdrawalReasonLabel(entry.withdrawalReasonCode);
  const parts: string[] = [withdrawal ? 'Withdrawn' : 'Pulled'];

  if (withdrawal && reason) parts.push(reason);
  if (entry.withdrawalReason) parts.push(entry.withdrawalReason);

  const money = refundState(entry);
  if (money) {
    parts.push(money);
  } else if (!withdrawal) {
    parts.push("refund at the club's discretion");
  } else if (reason) {
    parts.push('refund per the premium');
  }
  // A 'withdrawn' row with NO reason code says NOTHING about money, on purpose.
  // That state is not an exhibitor's act: it is what a secretary Decline/Reject
  // writes (`rejectEntry`), and what every pre-MYK9-632 row holds. The
  // reconciliation queue excludes it for exactly that reason
  // (`isUnresolvedRemovalRefundDecision`), so promising "refund per the premium"
  // here would advertise an obligation nobody agreed to and that no surface can
  // resolve. Silence is the honest answer, and it is what this line said before
  // MYK9-632 touched it.

  return parts.join(' · ');
}
