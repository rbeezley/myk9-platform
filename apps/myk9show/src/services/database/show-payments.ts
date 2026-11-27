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
 * the payments rather than showing a false $0. A desk late entry needs no client
 * write here: the server derives its ledger row from the entry when it syncs.
 * MYK9-2479: a desk cash or check payment is saved on the device first and, when
 * this send gets no answer, sent again from the offline queue under the same id
 * (`features/payments/deskPayments`).
 */

interface DbResult<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

/**
 * MYK9-1824: a refused or failed enrollment payment write, keeping the Postgres
 * error code so the caller can tell the RPC's own refusals from everything else.
 */
export class EnrollmentPaymentError extends Error {
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'EnrollmentPaymentError';
    this.code = code || undefined;
  }
}

interface ShowPaymentsSelectQuery {
  eq(column: string, value: string): ShowPaymentsSelectQuery;
  in(column: string, values: string[]): Promise<DbResult<Array<{ client_payment_id: string }>>>;
  order(column: string, options: { ascending: boolean }): ShowPaymentsSelectQuery;
  range(from: number, to: number): Promise<DbResult<ShowPaymentLedgerRow[]>>;
}

/** A PostgREST RPC call: awaitable, and cancellable by a signal. */
interface RpcCall<T> extends PromiseLike<DbResult<T>> {
  abortSignal(signal: AbortSignal): PromiseLike<DbResult<T>>;
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
  ): RpcCall<RecordedEnrollmentPayment>;
};

const LEDGER_COLUMNS =
  'id, enrollment_id, entry_id, kind, amount, method, received_on, client_payment_id';
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

/**
 * Throws the server's message (authorization, validation) on failure. `signal`
 * cancels the request (MYK9-2479: a desk payment waits a bounded time, then the
 * queue sends it again under the same id).
 */
export async function recordEnrollmentPayment(
  enrollmentId: string,
  action: EnrollmentLedgerAction,
  signal?: AbortSignal
): Promise<RecordedEnrollmentPayment> {
  const call = db.rpc('record_enrollment_payment', ledgerActionRpcArgs(enrollmentId, action));
  const { data, error } = await (signal ? call.abortSignal(signal) : call);
  if (error) throw new EnrollmentPaymentError(error.message, error.code);
  if (!data) throw new Error('The payment was not recorded. Please try again.');
  return data;
}

/**
 * MYK9-773: "Paid in Full: Online". Not a ledger action (online money never
 * reaches the cash box), but the server runs the same entries cascade as
 * `record_enrollment_payment` and answers in the same shape. Throws the
 * server's message on failure.
 */
export async function markEnrollmentPaidOnline(
  enrollmentId: string
): Promise<RecordedEnrollmentPayment> {
  const { data, error } = await supabase.rpc('mark_enrollment_paid_online', {
    p_enrollment_id: enrollmentId,
  });
  if (error) throw new EnrollmentPaymentError(error.message, error.code);
  if (!data) throw new Error('The payment was not recorded. Please try again.');
  return data as unknown as RecordedEnrollmentPayment;
}

/**
 * MYK9-2479: whether the signed-in user may read this show's ledger, which is what
 * `show_payments_select` admits (a site admin, or a show office manager). Only then
 * does an empty ledger read prove a payment is not there. Throws when either check
 * could not be made: an unknown answer is never "no".
 */
export async function canReadShowLedger(showId: string): Promise<boolean> {
  const [admin, office] = await Promise.all([
    supabase.rpc('is_site_admin'),
    supabase.rpc('is_show_office_manager', { check_show_id: showId }),
  ]);
  if (admin.error) throw new Error(admin.error.message);
  if (office.error) throw new Error(office.error.message);
  return admin.data === true || office.data === true;
}

/** The desk payment ids among `clientPaymentIds` the ledger holds. Throws on a failed read. */
export async function listLedgerClientPaymentIds(clientPaymentIds: string[]): Promise<Set<string>> {
  if (clientPaymentIds.length === 0) return new Set();
  const { data, error } = await db
    .from('show_payments')
    .select('client_payment_id')
    .in('client_payment_id', clientPaymentIds);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map(row => row.client_payment_id));
}
