/**
 * runOrderErrorToast — shared failure notifier for the at-show run-order PRESET
 * apply paths (single-class `useAtShowEntryListHandlers` + combined
 * `AtShowCombinedEntryListPage`). Both persist `run_order` through the
 * replication layer → `ringside_update_entry` SECURITY DEFINER RPC, which can
 * legitimately fail (an unassigned user hitting the entries UPDATE RLS denial,
 * or a replication-queue error). Before this, that failure was invisible — the
 * dialog just closed and the order silently stayed unchanged.
 *
 * The toast lives in the host layer, NOT in `@myk9/ringside`: ringside is a
 * shared package and must not hard-depend on sonner. The two callers wrap it
 * differently because their dialog contracts differ — the combined ringside
 * wrapper routes a thrown error to its (success-banner-suppressing) catch
 * branch, so the combined host re-throws after notifying; the single-class
 * dialog fires `onApplyOrder` fire-and-forget (`void`), so that host swallows
 * after notifying to avoid an unhandled rejection.
 */

import { toast } from 'sonner';
import { logger } from '@/utils/logger';

export const RUN_ORDER_PERSIST_ERROR_MESSAGE =
  "Couldn't update run order. Check your connection and try again.";

export function notifyRunOrderPersistError(error: unknown): void {
  logger.error('[at-show] apply run order failed', 'at-show', { error: String(error) });
  toast.error(RUN_ORDER_PERSIST_ERROR_MESSAGE);
}
