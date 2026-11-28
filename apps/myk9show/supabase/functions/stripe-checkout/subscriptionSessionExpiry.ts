// Subscription checkout must leave only one payable session per customer
// (MYK9-2449). The MYK9-2444 guard reads subscriptions, and an open Checkout
// Session is not a subscription yet, so two tabs opened before either is paid
// both pass it. Before creating a new session we expire every other open
// subscription-mode session for the customer, so Stripe itself holds the one
// session that can be paid. Newest wins; the old tab shows Stripe's expired page.
//
// Deno-free (structural Stripe type) so it runs under vitest.

import {
  hasBlockingSubscription,
  type SubscriptionLister,
} from '../_shared/existingSubscriptionGuard.ts';

export const SUBSCRIPTION_EXISTS_MESSAGE =
  'You already have a subscription. Visit your account settings to manage it.';
export const SUBSCRIPTION_CHECKOUT_RETRY_MESSAGE =
  'We could not safely start checkout. Please try again in a moment.';

interface OpenSessionLike {
  id: string;
  mode: string | null;
  status: string | null;
}

interface SessionPage {
  data: OpenSessionLike[];
  has_more: boolean;
}

export interface SubscriptionCheckoutStripe extends SubscriptionLister {
  checkout: {
    sessions: {
      list(params: {
        customer: string;
        status: 'open';
        limit: number;
        starting_after?: string;
      }): Promise<SessionPage>;
      expire(sessionId: string): Promise<unknown>;
      retrieve(sessionId: string): Promise<{ id: string; status: string | null }>;
    };
  };
}

export type ExpirePassResult =
  { kind: 'done'; expiredSessionIds: string[] } | { kind: 'failed'; diagnostic: string };

function diagnosticMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function listOpenSubscriptionSessions(
  stripe: SubscriptionCheckoutStripe,
  customerId: string
): Promise<OpenSessionLike[]> {
  const found: OpenSessionLike[] = [];
  let startingAfter: string | undefined;
  for (;;) {
    const page = await stripe.checkout.sessions.list({
      customer: customerId,
      status: 'open',
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    // Entry checkouts and payment links are payment mode; never touch them.
    found.push(...page.data.filter(s => s.mode === 'subscription' && s.status === 'open'));
    if (!page.has_more || page.data.length === 0) return found;
    startingAfter = page.data[page.data.length - 1].id;
  }
}

/**
 * Expire `sessionId`. A session that completed or expired between the list
 * and this call is already not payable as a second session, so it counts as
 * done; the caller's subscription recheck catches one that was just paid.
 * Stripe's "not open" error carries no stable code, so we retrieve the
 * session to see its real status instead of parsing the message.
 */
async function expireOne(
  stripe: SubscriptionCheckoutStripe,
  sessionId: string
): Promise<string | null> {
  try {
    await stripe.checkout.sessions.expire(sessionId);
    return null;
  } catch (expireError) {
    try {
      const current = await stripe.checkout.sessions.retrieve(sessionId);
      if (current.status === 'complete' || current.status === 'expired') return null;
      return `expire ${sessionId} failed while still ${current.status}: ${diagnosticMessage(expireError)}`;
    } catch (retrieveError) {
      return `expire ${sessionId} failed (${diagnosticMessage(expireError)}) and recheck failed: ${diagnosticMessage(retrieveError)}`;
    }
  }
}

/** Expire every open subscription-mode Checkout Session for the customer. */
export async function expireOpenSubscriptionSessions(
  stripe: SubscriptionCheckoutStripe,
  customerId: string
): Promise<ExpirePassResult> {
  let open: OpenSessionLike[];
  try {
    open = await listOpenSubscriptionSessions(stripe, customerId);
  } catch (error) {
    return { kind: 'failed', diagnostic: `list open sessions failed: ${diagnosticMessage(error)}` };
  }
  const expiredSessionIds: string[] = [];
  for (const session of open) {
    const failure = await expireOne(stripe, session.id);
    if (failure) return { kind: 'failed', diagnostic: failure };
    expiredSessionIds.push(session.id);
  }
  return { kind: 'done', expiredSessionIds };
}

export type SubscriptionCheckoutResult<T> =
  | { kind: 'created'; session: T; expiredSessionIds: string[] }
  | { kind: 'refused'; status: 400 | 503; error: string; diagnostic: string };

/**
 * Guard, expire, recheck, then create. `create` runs only when every other
 * open subscription session is closed and the customer still holds no
 * blocking subscription; any failure refuses without creating, so a failed
 * expire never leaves two payable sessions.
 */
export async function openSubscriptionCheckout<T>(
  stripe: SubscriptionCheckoutStripe,
  customerId: string,
  create: () => Promise<T>
): Promise<SubscriptionCheckoutResult<T>> {
  const blocked = (diagnostic: string): SubscriptionCheckoutResult<T> => ({
    kind: 'refused',
    status: 400,
    error: SUBSCRIPTION_EXISTS_MESSAGE,
    diagnostic,
  });

  // MYK9-2444: refuse a customer who already holds a usable subscription.
  if (await hasBlockingSubscription(stripe, customerId)) {
    return blocked('customer has a blocking subscription');
  }

  const pass = await expireOpenSubscriptionSessions(stripe, customerId);
  if (pass.kind === 'failed') {
    return {
      kind: 'refused',
      status: 503,
      error: SUBSCRIPTION_CHECKOUT_RETRY_MESSAGE,
      diagnostic: pass.diagnostic,
    };
  }

  // A tab can finish paying after the first check and before the list, so
  // its session is complete and never reaches expire. Check again.
  if (await hasBlockingSubscription(stripe, customerId)) {
    return blocked('a subscription completed during the expiry pass');
  }

  return { kind: 'created', session: await create(), expiredSessionIds: pass.expiredSessionIds };
}
