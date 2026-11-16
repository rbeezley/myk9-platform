import { isSupersededMoveUpEntry } from '@/features/financial/moneyRoot';
import { getEntryStatusKind, isRemovedStatus } from '@/services/entryDisplay/entryDisplaySelectors';

/**
 * MYK9-2082: whether a dog belongs on the check-in sheet and the scoresheet of the class it is
 * entered in. The source half of a move-up, a withdrawn, declined or scratched entry, and a pulled
 * dog will not run there, so the judge's sheet leaves them off. This is the rule the entry-form
 * grids use (`isSupersededMoveUpEntry` + `isRemovedStatus`), plus `check_in_status = 'pulled'`, and
 * it matches what the `emergency_packet_input` RPC already filters server side.
 *
 * Pending entries stay on the sheet (as they do on the RPC and the entry forms), and `absent` is a
 * show-day outcome that still prints.
 */
export function isEntryOnRunSheet(entry: {
  entryStatus?: string | null | undefined;
  checkInStatus?: string | null | undefined;
}): boolean {
  if (entry.checkInStatus === 'pulled') return false;
  if (isSupersededMoveUpEntry({ entryStatus: entry.entryStatus ?? null })) return false;
  return !isRemovedStatus(getEntryStatusKind(entry.entryStatus));
}
