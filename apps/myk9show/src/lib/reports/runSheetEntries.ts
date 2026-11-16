import { isSupersededMoveUpEntry } from '@/features/financial/moneyRoot';
import { getEntryStatusKind, isRemovedStatus } from '@/services/entryDisplay/entryDisplaySelectors';

/**
 * MYK9-2082: whether a dog belongs on the check-in sheet and the scoresheet of the class it is
 * entered in. The source half of a move-up, a withdrawn, declined or scratched entry, and a pulled
 * dog will not run there, so the judge's sheet leaves them off. This is the rule the entry-form
 * grids use (`isSupersededMoveUpEntry` + `isRemovedStatus`), plus `check_in_status = 'pulled'`, and
 * it matches what the `emergency_packet_input` RPC already filters server side.
 *
 * Pending entries stay on the sheet (as they do on the RPC and the entry forms).
 */
export function isEntryOnRunSheet(entry: {
  entryStatus?: string | null | undefined;
  checkInStatus?: string | null | undefined;
}): boolean {
  if (entry.checkInStatus === 'pulled') return false;
  if (isSupersededMoveUpEntry({ entryStatus: entry.entryStatus ?? null })) return false;
  const kind = getEntryStatusKind(entry.entryStatus);
  // `absent` is not a "removed" kind (it renders through normal results elsewhere), but the
  // packet RPC drops it from the run sheet (supabase/migrations/20261014214300_myk9_1162_held_entries.sql),
  // so the Reports sheets drop it too: one truth for who is on the run sheet.
  return !isRemovedStatus(kind) && kind !== 'absent';
}
