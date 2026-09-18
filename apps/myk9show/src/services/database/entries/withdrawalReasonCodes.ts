/**
 * MYK9-632: the STORED withdrawal reason for a set of entry rows.
 *
 * Online-only, and deliberately not read from the replica: the view the entries
 * replication mirrors does not return `withdrawal_reason_code` (see the note on
 * `ReplicatedEntry.withdrawalReasonCode`), so the snapshot cannot answer this.
 * The column carries `authenticated=r` and `entries_select` admits the caller's
 * own rows, so an exhibitor reads their own reason exactly as a show manager
 * reads it — one query, one code path, same answer on both surfaces.
 *
 * Every failure is SILENT by design. The reason is an elaboration on a badge
 * that already says "Withdrawn"; a row that cannot fetch it must render the
 * bare word, never an error. That includes the pre-migration database, which
 * `isWithdrawalReasonCodeSchemaUnavailable` recognises by its own error shape.
 */
import { supabase } from '../supabaseClient';
import { isWithdrawalReasonCodeSchemaUnavailable } from '@/features/payments/pullRefundSchemaCompatibility';

/** `entries.id` → its stored `withdrawal_reason_code`, for rows that have one. */
export type WithdrawalReasonCodeMap = Record<string, string | null>;

export async function getWithdrawalReasonCodesForEntries(
  entryIds: string[]
): Promise<WithdrawalReasonCodeMap> {
  if (entryIds.length === 0) return {};

  const { data, error } = await supabase
    .from('entries')
    .select('id, withdrawal_reason_code')
    .in('id', entryIds);

  if (error) {
    if (isWithdrawalReasonCodeSchemaUnavailable(error)) return {};
    throw error;
  }

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    withdrawal_reason_code: string | null;
  }>;
  return Object.fromEntries(rows.map(row => [row.id, row.withdrawal_reason_code ?? null]));
}
