export interface CheckoutSessionLike {
  id: string;
  status: string | null;
  amount_total?: number | null;
  url?: string | null;
}

interface CheckoutSessionsApi<T extends CheckoutSessionLike> {
  retrieve: (sessionId: string) => Promise<T>;
  expire: (sessionId: string) => Promise<unknown>;
}

type CheckoutSessionResolution<T extends CheckoutSessionLike> =
  | { kind: 'ready'; session: T; reused: boolean }
  | { kind: 'blocked'; status: 409 | 503; error: string };

interface ResolveCheckoutSessionOptions<T extends CheckoutSessionLike> {
  priorSessionId: string | null;
  expectedAmountCents: number;
  sessions: CheckoutSessionsApi<T>;
  createReplacement: () => Promise<T>;
}

export async function resolveCheckoutSession<T extends CheckoutSessionLike>({
  priorSessionId,
  expectedAmountCents,
  sessions,
  createReplacement,
}: ResolveCheckoutSessionOptions<T>): Promise<CheckoutSessionResolution<T>> {
  if (priorSessionId) {
    try {
      const existing = await sessions.retrieve(priorSessionId);

      if (existing.status === 'complete') {
        return {
          kind: 'blocked',
          status: 409,
          error:
            'Your payment for this cart is already processing. Give it a few seconds, then check My Entries.',
        };
      }

      if (existing.status === 'open') {
        if (existing.amount_total === expectedAmountCents && existing.url) {
          return { kind: 'ready', session: existing, reused: true };
        }
        await sessions.expire(existing.id);
      } else if (existing.status !== 'expired') {
        throw new Error(`Unexpected prior Checkout Session status: ${existing.status}`);
      }
    } catch {
      return {
        kind: 'blocked',
        status: 503,
        error: 'We could not safely resume checkout. Please try again in a moment.',
      };
    }
  }

  return { kind: 'ready', session: await createReplacement(), reused: false };
}
