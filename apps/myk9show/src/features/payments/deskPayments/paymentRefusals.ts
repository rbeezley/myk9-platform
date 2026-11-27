/**
 * How `record_enrollment_payment` refuses, shared by the payment dialogs
 * (`useEnrollmentLedgerActions`) and the device's payment lines (MYK9-2479).
 */

/** Postgres code of the RPCs' own validation refusals (every RAISE they can reach). */
export const RPC_REFUSAL_CODE = '22023';
/** Postgres insufficient_privilege: raised before either RPC writes anything. */
export const NOT_AUTHORIZED_CODE = '42501';

/**
 * The 22023 refusals the SQL writes for the person at the desk (a date or an
 * amount they typed), matched on the exact RAISE text in
 * `record_enrollment_payment`. The same code also carries technical refusals
 * (unsupported kind, enrollment not found, client_payment_id misuse, a method
 * the form never offers); those are not listed, so they never reach the screen.
 */
const FRIENDLY_REFUSALS: readonly RegExp[] = [
  /^received date .+ is after today \(.+\) on the show's calendar$/,
  /^a payment amount must be greater than zero$/,
  /^invalid payment amount \S+$/,
  /^invalid refund amount \S*$/,
  /^refund \S+ exceeds the \S+ still held \(\S+ paid, \S+ already refunded\)$/,
];

/** Whether a 22023 message is one written for the person at the desk. */
export function isFriendlyRefusal(message: string): boolean {
  return FRIENDLY_REFUSALS.some(pattern => pattern.test(message));
}

/**
 * MYK9-1936: a retry carried the payment's id with a changed received date or check
 * number, and the first save had landed. Nothing new is written, but the payment IS on
 * the form (as first typed), so this is not "not recorded".
 */
export const CHANGED_RETRY_REFUSAL =
  /^client_payment_id \S+ was already saved with a different received date or reference$/;

/** The Postgres code a thrown RPC error carries, if any. */
export function errorCodeOf(err: unknown): string | undefined {
  const code =
    typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
  return typeof code === 'string' && code.length > 0 ? code : undefined;
}
