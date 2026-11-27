import type { PendingMutation } from '@myk9/replication';
import type { EnrollmentLedgerAction } from '@/features/payments/showPaymentLedger';
import { logger } from '@/services/LoggingService';
import { defaultDeskPaymentDeps, type DeskPaymentDeps } from './deskPaymentDeps';
import { announceDeskPaymentsRecorded } from './deskPaymentEvents';
import { deadLetterMessage } from './deskPaymentReader';
import type { DeskSendOutcome } from './DeskPaymentsTable';
import {
  DESK_PAYMENTS_TABLE,
  type DeskPaymentForm,
  type LocalDeskPayment,
} from './deskPaymentTypes';
import { NOT_AUTHORIZED_CODE, RPC_REFUSAL_CODE } from './paymentRefusals';

/**
 * How long the dialog waits on the queue's first send before leaving the payment to it
 * (the precedent is 12 s, `completeStaleClassRpc.ts`). Venue Wi-Fi with no internet
 * keeps `navigator.onLine` true, so the wait, not the flag, ends it.
 */
export const DESK_PAYMENT_WAIT_MS = 10_000;
/** How often the wait looks at the queue's record of that send. */
const OUTCOME_POLL_MS = 250;

type PaymentAction = Extract<EnrollmentLedgerAction, { kind: 'payment' }>;

export type DeskPaymentSaveResult =
  /** The queue's send was acknowledged: recorded, and the show's money is being reloaded. */
  | { kind: 'saved' }
  /** Refused on its first send; its record and queue row are gone, so nothing can replay. */
  | { kind: 'refused'; error: unknown }
  /** Saved on this device and queued under the same id. `sendBegun`: a send went out unanswered. */
  | { kind: 'queued'; sendBegun: boolean }
  /**
   * Not saved on this device, so NOTHING was sent: `invalid-amount` is not whole cents above
   * $0; `not-stored` is storage refusing it, no queue owner, or an account switch mid-write.
   */
  | { kind: 'not-saved'; reason: 'invalid-amount' | 'not-stored'; error: unknown };

/** Whole cents, positive: the only amounts a desk payment carries. */
function wholeCents(amount: number): number | null {
  const cents = Math.round(amount * 100);
  return Number.isFinite(amount) && cents > 0 && Math.abs(cents - amount * 100) < 1e-6
    ? cents
    : null;
}

/**
 * The server's answer to the FIRST send, and a refusal raised before the RPC writes
 * anything: a 22023 or 42501 with no earlier failed or lost attempt (`retries` counts the
 * one that moved it, and no send was lost first). Anything later may follow a send that
 * was recorded, so it is not called refused here.
 */
function isFirstSendRefusal(dead: PendingMutation): boolean {
  return (
    (dead.errorCode === RPC_REFUSAL_CODE || dead.errorCode === NOT_AUTHORIZED_CODE) &&
    (dead.retries ?? 0) <= 1 &&
    !dead.priorTransportRetries
  );
}

/**
 * Asks the queue to send it now and waits, at most `DESK_PAYMENT_WAIT_MS`, for the queue's
 * record of that one mutation to say acknowledged or dead-lettered. Reads the queue's own
 * state, so it hears the outcome whichever upload pass sent it.
 */
async function awaitQueueOutcome(
  deps: DeskPaymentDeps,
  id: string,
  mutationId: string
): Promise<DeskSendOutcome> {
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>(resolve => {
    timer = setTimeout(() => {
      expired = true;
      resolve();
    }, DESK_PAYMENT_WAIT_MS);
  });
  try {
    const sent = deps.queue.sendRowNow(DESK_PAYMENTS_TABLE, id).catch(error => {
      logger.warn('Desk payment send could not start', 'secretary', {}, error as Error);
    });
    await Promise.race([sent, deadline]);
    let outcome = await deps.table.sendOutcome(id, mutationId);
    while (outcome.kind === 'pending' && !expired) {
      await Promise.race([new Promise(resolve => setTimeout(resolve, OUTCOME_POLL_MS)), deadline]);
      outcome = await deps.table.sendOutcome(id, mutationId);
    }
    return outcome;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Settle it for the account that saved it. `settled` / `nothing-held`: its record, queue
 * row and any dead letter are gone. `kept`: any of it may remain (another account is
 * signed in now, it is another account's, or the device could not write).
 */
async function settleFor(
  deps: DeskPaymentDeps,
  id: string,
  owner: string | null
): Promise<'settled' | 'nothing-held' | 'kept'> {
  try {
    const result = await deps.table.settle(id, owner);
    if (result !== 'not-owner') return result;
    logger.warn('Desk payment left queued: not the signed-in account’s to settle', 'secretary');
  } catch (error) {
    logger.warn(
      'Desk payment could not be settled on this device',
      'secretary',
      {},
      error as Error
    );
  }
  return 'kept';
}

/**
 * MYK9-2479: record one cash or check payment. It is saved on this device FIRST, the
 * record and its queue row in one transaction, and the queue is the ONLY path that sends
 * it: online, the queue is asked to send it at once and the dialog waits on that send.
 * Every send carries the same client payment id and the same explicit amount, under the
 * queue owner's session, so a lost answer is recorded once and a replay never pays
 * "whatever is due by then".
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
  let queued: { mutationId: string; owner: string | null };
  try {
    queued = await deps.table.queuePayment(payment);
  } catch (error) {
    return { kind: 'not-saved', reason: 'not-stored', error };
  }
  if (!online) return { kind: 'queued', sendBegun: false };

  const outcome = await awaitQueueOutcome(deps, payment.id, queued.mutationId);
  if (outcome.kind === 'acknowledged') {
    // The queue keeps no RPC answer, so the form's figures come back from the server. The
    // app-wide upload handler may have settled and announced it already: one announcement.
    if ((await settleFor(deps, payment.id, queued.owner)) === 'settled') {
      announceDeskPaymentsRecorded([payment.showId]);
    }
    return { kind: 'saved' };
  }
  // "Not recorded" invites a re-entry under a NEW id, so it is said only for a refusal of
  // the first send, and only once its record and queue row are gone for the account that
  // saved it. Otherwise it stays on its line under its own id, and the queue decides it.
  if (
    outcome.kind === 'dead' &&
    isFirstSendRefusal(outcome.mutation) &&
    (await settleFor(deps, payment.id, queued.owner)) !== 'kept'
  ) {
    const dead = outcome.mutation;
    return {
      kind: 'refused',
      error: Object.assign(new Error(deadLetterMessage(dead)), { code: dead.errorCode }),
    };
  }
  return { kind: 'queued', sendBegun: true };
}
