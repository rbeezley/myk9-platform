import type { ShowDeskPendingSignal, ShowDeskPendingSignalScope } from './showDeskPendingSignals';

/**
 * MYK9-2166: the club's Stripe payouts are off on a published show. Present only when the answer is
 * known (`payoutsKnownOff`); an unread, offline or errored answer leaves it out. `paymentsHref` is
 * the club's Payments tab when she can open it, `null` when she cannot (a secretary who is not a
 * club admin), and the wording then names who can.
 */
export interface ShowDeskCardPausedInput {
  paymentsHref: string | null;
}

export function buildCardPausedSignal(
  input: ShowDeskCardPausedInput,
  scope: ShowDeskPendingSignalScope
): ShowDeskPendingSignal {
  const canOpen = input.paymentsHref !== null;
  return {
    id: 'card-payment-paused',
    count: 1,
    priority: 'high',
    label: canOpen
      ? "Card payment is paused. The club's bank account needs attention."
      : "Card payment is paused. A club admin needs to fix the club's bank account.",
    href: input.paymentsHref,
    ...(canOpen ? { destinationName: 'Payments' } : {}),
    scope,
  };
}
