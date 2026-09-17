/**
 * MYK9-632: one sentence for a row an exhibitor has left.
 *
 * Says WHICH act happened, WHY (for a withdrawal), and what is true about the
 * money RIGHT NOW. The last part is the point: a card that keeps saying "refund
 * at the club's discretion" after the club has already refunded or denied is
 * telling the secretary the decision is still open, and invites a second refund
 * on the same entry.
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
  const parts: string[] = [withdrawal ? 'Withdrawn' : 'Pulled'];

  const reason = withdrawalReasonLabel(entry.withdrawalReasonCode);
  if (withdrawal && reason) parts.push(reason);
  if (entry.withdrawalReason) parts.push(entry.withdrawalReason);

  const money = refundState(entry);
  parts.push(money ?? (withdrawal ? 'refund per the premium' : "refund at the club's discretion"));

  return parts.join(' · ');
}
