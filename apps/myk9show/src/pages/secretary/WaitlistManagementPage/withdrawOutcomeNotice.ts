/**
 * What the secretary is told after "Withdraw offer", chosen from the server's result
 * (MYK9-1001, Codex P2 on #2772). Plain and calm (docs/INTENT.md, secretary): say what
 * happened and, only when it matters, what to do next.
 */
import type { WithdrawOfferOutcome } from '@/services/database/waitlists';

export interface WithdrawOutcomeNotice {
  tone: 'success' | 'warning' | 'info' | 'error';
  message: string;
}

const NOT_TOLD = "the exhibitor's notification didn't send. Let them know directly.";

const CHECKOUT_OPEN =
  'Offer withdrawn, but its checkout page could not be closed. If the exhibitor pays on it, the payment goes to the refund queue for approval.';

export function withdrawOutcomeNotice(outcome: WithdrawOfferOutcome): WithdrawOutcomeNotice {
  // The offer is closed either way; a checkout page still open is what needs attention first.
  if ((outcome.result === 'withdrawn' || outcome.result === 'expired') && !outcome.checkoutClosed) {
    return { tone: 'warning', message: CHECKOUT_OPEN };
  }
  switch (outcome.result) {
    case 'withdrawn':
      return outcome.notified
        ? {
            tone: 'success',
            message: 'Offer withdrawn. The exhibitor has been told no payment is due.',
          }
        : { tone: 'warning', message: `Offer withdrawn, but ${NOT_TOLD}` };
    case 'expired':
      // The deadline had passed: closed as the expiry it was, with the expiry notice
      // ("Your waitlist offer has ended").
      return outcome.notified
        ? {
            tone: 'info',
            message:
              'This offer had already run out of time, so it is closed. The exhibitor has been told it ended.',
          }
        : {
            tone: 'warning',
            message: `This offer had already run out of time, so it is closed, but ${NOT_TOLD}`,
          };
    case 'already_closed':
      // Someone or something closed it first; it was told then. Nothing went wrong.
      return {
        tone: 'info',
        message: 'This offer was already closed. Nothing else was sent to the exhibitor.',
      };
    case 'paid':
      return {
        tone: 'error',
        message: 'This dog has already paid for the spot, so the offer cannot be withdrawn.',
      };
    case 'not_found':
      return { tone: 'error', message: 'This offer was not found. It may have been removed.' };
  }
}
