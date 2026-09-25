import { supabase } from './supabaseClient';
import {
  ledgerActionRpcArgs,
  type EnrollmentLedgerAction,
  type RecordedEnrollmentPayment,
  type ShowPaymentLedgerRow,
} from '@/features/payments/showPaymentLedger';

/**
 * MYK9-677: reads and writes of the payments ledger.
 *
 * ONLINE on purpose, like the enrollment money it sits beside: the secretary
 * entry read fetches each enrollment's payment columns over PostgREST
 * (`loadSecretaryEnrollmentsMap` in entries/secretaryReadReplication.ts), and
 * the closeout card already reads incidents the same way. Closeout is a
 * reconciliation run with a connection; offline, the card says it cannot load
 * the payments rather than showing a false $0. The one OFFLINE money writer, a
 * desk late entry, needs no client write here: the server derives its ledger
 * row from the entry when it syncs.
 */

interface DbResult<T> {
  data: T | null;
  error: { message: string } | null;
}

interface ShowPaymentsSelectQuery {
  eq(column: string, value: string): ShowPaymentsSelectQuery;
  order(column: string, options: { ascending: boolean }): ShowPaymentsSelectQuery;
  range(from: number, to: number): Promise<DbResult<ShowPaymentLedgerRow[]>>;
}

// `show_payments` and `record_enrollment_payment` are newer than the checked-in
// generated types (migration 20260925181937), so the client is narrowed
// structurally here, as show-incidents.ts and dogFavoritesSync.ts do. One cast,
// in one place; drop it once the types regenerate after the push.
const db = supabase as unknown as {
  from(table: 'show_payments'): { select(columns: string): ShowPaymentsSelectQuery };
  rpc(
    fn: 'record_enrollment_payment',
    args: Record<string, unknown>
  ): Promise<DbResult<RecordedEnrollmentPayment>>;
};

const LEDGER_COLUMNS = 'id, enrollment_id, entry_id, kind, amount, method, received_on';
/** PostgREST caps a response at max_rows (1000); money is never half-read. */
const PAGE_SIZE = 1000;

export const showPaymentsQueryKey = (showId: string) => ['show-payments', showId] as const;

export async function listShowPayments(showId: string): Promise<ShowPaymentLedgerRow[]> {
  const rows: ShowPaymentLedgerRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from('show_payments')
      .select(LEDGER_COLUMNS)
      .eq('show_id', showId)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

/** Throws the server's message (authorization, validation) on failure. */
export async function recordEnrollmentPayment(
  enrollmentId: string,
  action: EnrollmentLedgerAction
): Promise<RecordedEnrollmentPayment> {
  const { data, error } = await db.rpc(
    'record_enrollment_payment',
    ledgerActionRpcArgs(enrollmentId, action)
  );
  if (error) throw new Error(error.message);
  if (!data) throw new Error('The payment was not recorded. Please try again.');
  return data;
}
