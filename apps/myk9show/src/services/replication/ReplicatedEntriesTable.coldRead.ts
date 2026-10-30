import { supabase } from '@/services/database/supabaseClient';
import { isPlacementTieSchemaUnavailable } from '@/features/payments/pullRefundSchemaCompatibility';
import { COLD_ENTRY_ROW_SELECT } from './ReplicatedEntriesTable.coldReadColumns';

/** MYK9-1473's tie pair (20261029043900), the one cold-read column set added after the others. */
const PLACEMENT_TIE_COLUMNS = new Set(['placement_tie', 'placement_tiebreak']);

const COLD_ENTRY_ROW_SELECT_WITHOUT_TIE = COLD_ENTRY_ROW_SELECT.split(',')
  .filter(column => !PLACEMENT_TIE_COLUMNS.has(column))
  .join(',');

/**
 * One whole-entry cold read (write hydration, withdraw read, post-withdrawal read-back). A
 * frontend served before `supabase db push` lands 20261029043900 gets 42703 for the whole
 * request (MYK9-1527), so a read that names the tie pair is retried once without it; the
 * degraded row carries no tie state, which is "no coin flip owed".
 */
export async function readColdEntryRow(
  entryId: string
): Promise<{ data: unknown; error: unknown }> {
  const run = (select: string) =>
    supabase
      .from('view_authenticated_entry_results_replication')
      .select(select)
      .eq('id', entryId)
      .maybeSingle();
  const first = await run(COLD_ENTRY_ROW_SELECT);
  if (!isPlacementTieSchemaUnavailable(first.error)) return first;
  return run(COLD_ENTRY_ROW_SELECT_WITHOUT_TIE);
}
