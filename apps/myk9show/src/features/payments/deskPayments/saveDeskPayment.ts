import type {
  EnrollmentLedgerAction,
  RecordedEnrollmentPayment,
} from '@/features/payments/showPaymentLedger';
import { logger } from '@/services/LoggingService';
import { defaultDeskPaymentDeps, type DeskPaymentDeps } from './deskPaymentDeps';
import {
  DESK_PAYMENTS_TABLE,
  type DeskPaymentForm,
  type LocalDeskPayment,
} from './deskPaymentTypes';
import { errorCodeOf, NOT_AUTHORIZED_CODE, RPC_REFUSAL_CODE } from './paymentRefusals';

/**
 * How long the dialog waits on the server's answer before the payment is left to
 * the queue (the precedent is 12 s, `completeStaleClassRpc.ts`). Venue Wi-Fi with no
 * internet keeps `navigator.onLine` true, so the wait, not the flag, ends it.
 */
export const DESK_PAYMENT_WAIT_MS = 10_000;
/** The queue's hold outlasts the wait, so no upload pass sends it while this send is out. */
const HOLD_MARGIN_MS = 5_000;

type PaymentAction = Extract<EnrollmentLedgerAction, { kind: 'payment' }>;

export type DeskPaymentSaveResult =
  /** The server answered: the record and queue row are settled from its answer. */
  | { kind: 'saved'; recorded: RecordedEnrollmentPayment }
  /** The server refused it within the wait; nothing was recorded and nothing stays queued. */
  | { kind: 'refused'; error: unknown }
  /** Saved on this device and queued under the same id. `sendBegun`: a send went out unanswered. */
  | { kind: 'queued'; sendBegun: boolean }
  /**
   * Not saved on this device, so NOTHING was sent: `invalid-amount` is not whole cents above
   * $0; `not-stored` is storage refusing it or no queue owner. Never sent without a record.
   */
  | { kind: 'not-saved'; reason: 'invalid-amount' | 'not-stored'; error: unknown };

/** Whole cents, positive: the only amounts a desk payment carries. */
function wholeCents(amount: number): number | null {
  const cents = Math.round(amount * 100);
  return Number.isFinite(amount) && cents > 0 && Math.abs(cents - amount * 100) < 1e-6
    ? cents
    : null;
}

/** A refusal the server answered with: raised before the RPC writes anything. */
function isAnsweredRefusal(error: unknown): boolean {
  const code = errorCodeOf(error);
  return code === RPC_REFUSAL_CODE || code === NOT_AUTHORIZED_CODE;
}

/**
 * True only when the record, its queue row and any dead letter are gone for the account
 * that saved it. False when any of it may remain: another account is signed in now, it is
 * another account's, or the device could not write. Its queue row then stays to be sent.
 */
async function settledFor(deps: DeskPaymentDeps, id: string, owner: string | null) {
  try {
    if ((await deps.table.settle(id, owner)) === 'settled') return true;
    logger.warn('Desk payment left queued: not the signed-in account’s to settle', 'secretary');
  } catch (error) {
    logger.warn(
      'Desk payment could not be settled on this device',
      'secretary',
      {},
      error as Error
    );
  }
  return false;
}

function handToQueue(deps: DeskPaymentDeps, id: string): void {
  void deps.queue.sendRowNow(DESK_PAYMENTS_TABLE, id).catch(err => {
    logger.warn('Desk payment hand-off to the queue failed', 'secretary', {}, err as Error);
  });
}

/**
 * MYK9-2479: record one cash or check payment. It is saved on this device FIRST,
 * the record and its queue row in one transaction, then (online) sent at once with
 * a bounded wait. The first send and every replay carry the same client payment id
 * and the same explicit amount, so a lost answer is recorded once and a replay never
 * pays "whatever is due by then".
 */
export async function saveDeskPayment(
  enrollmentId: string,
  action: PaymentAction,
  form: DeskPaymentForm,
  deps: DeskPaymentDeps = defaultDeskPaymentDeps
): Promise<DeskPaymentSaveResult> {
  const cents = wholeCents(action.amount);
  if (cents === null) {
    return {
      kind: 'not-saved',
      reason: 'invalid-amount',
      error: new Error('A payment amount must be whole cents above $0.'),
    };
  }
  const online = deps.isOnline();
  const payment: LocalDeskPayment = {
    id: action.clientPaymentId,
    showId: form.showId,
    enrollmentId,
    exhibitorName: form.exhibitorName,
    amount: cents / 100,
    method: action.method,
    receivedOn: action.receivedOn,
    reference: action.reference?.trim() || null,
    receivedAt: new Date(deps.now()).toISOString(),
    sendBegun: online,
  };
  // The account the record is stamped with, captured now: only it may settle the payment.
  let owner: string | null;
  try {
    owner = await deps.table.queuePayment(
      payment,
      online ? deps.now() + DESK_PAYMENT_WAIT_MS + HOLD_MARGIN_MS : undefined
    );
  } catch (error) {
    return { kind: 'not-saved', reason: 'not-stored', error };
  }
  if (!online) return { kind: 'queued', sendBegun: false };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DESK_PAYMENT_WAIT_MS);
  try {
    const recorded = await deps.send(
      enrollmentId,
      { ...action, amount: payment.amount },
      controller.signal
    );
    // Answered. Not settled here, the queue replays it under the same id, and the server
    // answers that id without recording it twice.
    if (!(await settledFor(deps, payment.id, owner))) handToQueue(deps, payment.id);
    return { kind: 'saved', recorded };
  } catch (error) {
    // Stays in the dialog, as before, so she sees why and can fix what she typed: but
    // "not recorded" invites a re-entry under a NEW id, so it is said only once the queued
    // write is gone for the account that saved it. Not settled (a write failure, or another
    // account signed in mid-request), the original could still replay beside her re-entry,
    // so it stays on its line under its own id instead, and the queue's answer decides it.
    if (
      !controller.signal.aborted &&
      isAnsweredRefusal(error) &&
      (await settledFor(deps, payment.id, owner))
    ) {
      return { kind: 'refused', error };
    }
    // No answer (a transport failure, or the wait ran out): the queue sends it again,
    // under the same id, without her doing anything.
    handToQueue(deps, payment.id);
    return { kind: 'queued', sendBegun: true };
  } finally {
    clearTimeout(timer);
  }
}
