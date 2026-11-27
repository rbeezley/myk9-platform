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
  /** Not saved on this device (no queue owner, storage refused, an amount that is not money). */
  | { kind: 'not-saved'; error: unknown };

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

async function settleQuietly(deps: DeskPaymentDeps, id: string): Promise<void> {
  try {
    await deps.table.settle(id);
  } catch (error) {
    // Left held, the queue sends it again under the same id once the hold passes,
    // and the server answers that id without recording it twice.
    logger.warn(
      'Desk payment could not be settled on this device',
      'secretary',
      {},
      error as Error
    );
  }
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
  try {
    await deps.table.queuePayment(
      payment,
      online ? deps.now() + DESK_PAYMENT_WAIT_MS + HOLD_MARGIN_MS : undefined
    );
  } catch (error) {
    return { kind: 'not-saved', error };
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
    await settleQuietly(deps, payment.id);
    return { kind: 'saved', recorded };
  } catch (error) {
    if (!controller.signal.aborted && isAnsweredRefusal(error)) {
      // Stays in the dialog, as before: she sees why and can fix what she typed.
      await settleQuietly(deps, payment.id);
      return { kind: 'refused', error };
    }
    // No answer (a transport failure, or the wait ran out): the queue sends it again,
    // under the same id, without her doing anything.
    void deps.queue.sendRowNow(DESK_PAYMENTS_TABLE, payment.id).catch(err => {
      logger.warn('Desk payment hand-off to the queue failed', 'secretary', {}, err as Error);
    });
    return { kind: 'queued', sendBegun: true };
  } finally {
    clearTimeout(timer);
  }
}
