import type { LedgerMethod } from '@/features/payments/showPaymentLedger';

/** The queue table and RPC every desk payment is sent through (MYK9-2479). */
export const DESK_PAYMENTS_TABLE = 'show_payments';
export const DESK_PAYMENT_RPC = 'record_enrollment_payment';

/**
 * A cash or check payment saved on this device before any network attempt
 * (MYK9-2479). Keyed by its client payment id, the id every send of it carries,
 * so the server records it once however many times it is sent. Stored per
 * signed-in account: another account on a shared desk device never sees it.
 */
export interface LocalDeskPayment {
  /** The client payment id (`p_client_payment_id`). */
  id: string;
  showId: string;
  enrollmentId: string;
  exhibitorName: string;
  /** Dollars, whole cents: the money she was shown and took. Never null. */
  amount: number;
  method: LedgerMethod;
  /** `YYYY-MM-DD` on the show's calendar. */
  receivedOn: string;
  /** The check number, or null. */
  reference: string | null;
  /** When she saved it on this device (ISO). */
  receivedAt: string;
  /** A send began while the browser was online, so its outcome may be unknown. */
  sendBegun: boolean;
}

/** What settling one payment found: `not-owner` removed nothing (another account's, or no account). */
export type DeskPaymentSettleResult = 'settled' | 'not-owner';

/** The form a payment belongs to, for its local record. */
export interface DeskPaymentForm {
  showId: string;
  exhibitorName: string;
}

/**
 * Where one local payment stands. Unknown is never refused, and a new id is never
 * minted (plan-offline-desk-payments § 2):
 * - `waiting`: queued, no send has begun while online. It will send on its own.
 * - `unconfirmed`: a send began and its outcome is unknown; still queued, so it will
 *   be sent again on its own.
 * - `unconfirmed-stopped`: out of retries (a `max-retries` dead letter). It will not
 *   send on its own; Try again resends the same mutation and id.
 * - `not-checked`: refused for access (42501), or a refusal this device cannot check
 *   against the ledger. Try again only.
 * - `refused`: a 22023 refusal, the ledger is readable to her, and a read begun after
 *   the refusal holds no row with its id. Remove only.
 */
export type DeskPaymentState =
  'waiting' | 'unconfirmed' | 'unconfirmed-stopped' | 'not-checked' | 'refused';

/** One local payment as its line shows it, with what she may do. */
export interface DeskPaymentLine {
  payment: LocalDeskPayment;
  /** The account whose record it is: settling it is that account's alone. */
  owner: string | null;
  state: DeskPaymentState;
  /** The dead letter Try again re-queues; absent when there is none to retry. */
  failedMutationId?: string | undefined;
  /** What a refusal said, in words for the desk (Refused only). */
  reason?: string | undefined;
}
