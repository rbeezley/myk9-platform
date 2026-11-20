import { supabase } from './supabaseClient';

/**
 * MYK9-2303: money the club paid an exhibitor directly after the show's payout.
 *
 * ONLINE on purpose: recording happens after the show and the payout, never
 * ringside, and the RPCs are explicitly online-only money paths. Each RPC raises
 * P0001 with a stable code as the message; that code rides on the thrown error.
 */

export type ClubRefundMethod = 'check' | 'cash' | 'other';

/** The columns the ledger list reads. */
export type ClubSettledRefundListRow = Pick<
  ClubSettledRefundRow,
  'id' | 'amount' | 'reverses_id' | 'paid_on' | 'method' | 'reference' | 'note'
>;

export interface ClubSettledRefundRow {
  id: string;
  show_id: string;
  entry_id: string;
  /** Positive: money the club paid back. Negative: a reversal. */
  amount: number;
  reverses_id: string | null;
  paid_on: string | null;
  method: ClubRefundMethod | null;
  reference: string | null;
  note: string | null;
  recorded_by: string | null;
  client_refund_id: string;
  created_at: string;
}

export interface RecordClubRefundInput {
  entryId: string;
  amount: number;
  paidOn: string;
  method: ClubRefundMethod;
  reference: string;
  note: string;
  clientRefundId: string;
}

export interface ReverseClubRefundInput {
  refundId: string;
  clientRefundId: string;
}

interface DbResult<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

/** A refused or failed club refund write; `code` is the RPC's own refusal code, when it gave one. */
export class ClubSettledRefundError extends Error {
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'ClubSettledRefundError';
    this.code = code || undefined;
  }
}

/** The RPCs raise P0001 with the refusal code as the message; anything else has no code. */
function refusal(error: { message: string; code?: string } | null): ClubSettledRefundError {
  if (!error) return new ClubSettledRefundError('No row came back');
  return new ClubSettledRefundError(
    error.message,
    error.code === 'P0001' ? error.message.trim() : undefined
  );
}

interface ListQuery {
  eq(column: string, value: string): ListQuery;
  order(
    column: string,
    options: { ascending: boolean }
  ): Promise<DbResult<ClubSettledRefundListRow[]>>;
}

// `club_settled_refunds` and its RPCs are newer than the checked-in generated
// types, so the client is narrowed structurally, as show-payments.ts does.
// `show_payouts` is generated, so it goes through the typed client.
const db = supabase as unknown as {
  from(table: 'club_settled_refunds'): { select(columns: string): ListQuery };
  rpc(
    fn: 'record_club_settled_refund' | 'reverse_club_settled_refund',
    args: Record<string, unknown>
  ): Promise<DbResult<ClubSettledRefundRow>>;
};

const LIST_COLUMNS = 'id, amount, reverses_id, paid_on, method, reference, note';

export const clubSettledRefundsQueryKey = (entryId: string) =>
  ['club-settled-refunds', entryId] as const;
export const showPayoutStatusQueryKey = (showId: string) => ['show-payout-status', showId] as const;

/** A fresh retry key; the caller keeps one per submit attempt and reuses it on retry. */
export const newClubRefundRetryKey = (): string => crypto.randomUUID();

export async function listClubSettledRefunds(entryId: string): Promise<ClubSettledRefundListRow[]> {
  const { data, error } = await db
    .from('club_settled_refunds')
    .select(LIST_COLUMNS)
    .eq('entry_id', entryId)
    .order('created_at', { ascending: true });
  if (error) throw refusal(error);
  return data ?? [];
}

/** The show's non-failed payout status, or null when there is none. */
export async function getShowPayoutStatus(showId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('show_payouts')
    .select('status')
    .eq('show_id', showId)
    .neq('status', 'failed')
    .maybeSingle();
  if (error) throw refusal(error);
  return data?.status ?? null;
}

export async function recordClubSettledRefund(
  input: RecordClubRefundInput
): Promise<ClubSettledRefundRow> {
  const { data, error } = await db.rpc('record_club_settled_refund', {
    p_entry_id: input.entryId,
    p_amount: input.amount,
    p_paid_on: input.paidOn,
    p_method: input.method,
    p_reference: input.reference || null,
    p_note: input.note || null,
    p_client_refund_id: input.clientRefundId,
  });
  if (error || !data) throw refusal(error);
  return data;
}

export async function reverseClubSettledRefund(
  input: ReverseClubRefundInput
): Promise<ClubSettledRefundRow> {
  const { data, error } = await db.rpc('reverse_club_settled_refund', {
    p_refund_id: input.refundId,
    p_note: null,
    p_client_refund_id: input.clientRefundId,
  });
  if (error || !data) throw refusal(error);
  return data;
}
