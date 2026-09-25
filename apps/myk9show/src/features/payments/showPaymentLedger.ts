/**
 * MYK9-677: the payments ledger (`public.show_payments`,
 * migration 20260925181937). One row per cash/check payment received,
 * refunded or reversed on a show; the Show Closeout money card sums it.
 *
 * Online (Stripe) money is never in it: the card reconciles a cash box.
 */

export type LedgerMethod = 'cash' | 'check';
export type LedgerKind = 'payment' | 'refund' | 'reversal';

/** The columns the closeout card reads. */
export interface ShowPaymentLedgerRow {
  id: string;
  enrollment_id: string | null;
  entry_id: string | null;
  kind: LedgerKind;
  /** numeric(10,2): PostgREST may hand it over as a string. */
  amount: number | string;
  method: LedgerMethod;
  /** A Postgres `date` on the show's calendar, `YYYY-MM-DD`. */
  received_on: string;
}

/**
 * One call to `record_enrollment_payment`. Amounts are dollars.
 *
 * - `payment`: THIS payment (a partial adds to what was paid); `amount: null`
 *   pays whatever is still due ("Paid in Full").
 * - `refund`: money handed back. `method: null` means it went back some other
 *   way (Stripe, other), which the enrollment records and the ledger does not.
 * - `reversal`: "Payment Due", nothing was received after all.
 */
export type EnrollmentLedgerAction =
  | {
      kind: 'payment';
      method: LedgerMethod;
      amount: number | null;
      receivedOn: string;
      reference?: string | null | undefined;
    }
  | {
      kind: 'refund';
      method: LedgerMethod | null;
      amount: number;
      receivedOn: string;
      notes: string | null;
    }
  | { kind: 'reversal' };

/** The enrollment as `record_enrollment_payment` left it. */
export interface RecordedEnrollmentPayment {
  id: string;
  payment_status: string;
  paid_amount: number | string;
  payment_reference: string | null;
  refund_amount: number | string | null;
  refund_notes: string | null;
  refunded_at: string | null;
}

/** The RPC's named arguments for one action. */
export function ledgerActionRpcArgs(
  enrollmentId: string,
  action: EnrollmentLedgerAction
): Record<string, unknown> {
  switch (action.kind) {
    case 'payment':
      return {
        p_enrollment_id: enrollmentId,
        p_kind: 'payment',
        p_amount: action.amount,
        p_method: action.method,
        p_received_on: action.receivedOn,
        p_reference: action.reference?.trim() || null,
      };
    case 'refund':
      return {
        p_enrollment_id: enrollmentId,
        p_kind: 'refund',
        p_amount: action.amount,
        p_method: action.method,
        p_received_on: action.receivedOn,
        p_note: action.notes,
      };
    case 'reversal':
      return { p_enrollment_id: enrollmentId, p_kind: 'reversal' };
  }
}

export function ledgerAmount(row: Pick<ShowPaymentLedgerRow, 'amount'>): number {
  const value = typeof row.amount === 'string' ? Number(row.amount) : row.amount;
  return Number.isFinite(value) ? value : 0;
}
