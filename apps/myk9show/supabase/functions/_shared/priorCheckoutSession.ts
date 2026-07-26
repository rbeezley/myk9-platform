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
  | { kind: 'ready'; session: T; reused: boolean; expiredSessionId: string | null }
  | {
      kind: 'blocked';
      status: 409 | 503;
      error: string;
      reason: 'complete' | 'retrieve_failed' | 'expire_failed' | 'unexpected_status';
      diagnostic: string;
    };

interface ResolveCheckoutSessionOptions<T extends CheckoutSessionLike> {
  priorSessionId: string | null;
  expectedAmountCents: number;
  sessions: CheckoutSessionsApi<T>;
  createReplacement: () => Promise<T>;
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const directCode = (error as { code?: unknown }).code;
  if (typeof directCode === 'string') return directCode;
  const rawCode = (error as { raw?: { code?: unknown } }).raw?.code;
  return typeof rawCode === 'string' ? rawCode : undefined;
}

function diagnosticMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function resolveCheckoutSession<T extends CheckoutSessionLike>({
  priorSessionId,
  expectedAmountCents,
  sessions,
  createReplacement,
}: ResolveCheckoutSessionOptions<T>): Promise<CheckoutSessionResolution<T>> {
  let expiredSessionId: string | null = null;

  if (priorSessionId) {
    let existing: T | null = null;
    try {
      existing = await sessions.retrieve(priorSessionId);
    } catch (error) {
      if (errorCode(error) !== 'resource_missing') {
        return {
          kind: 'blocked',
          status: 503,
          error: 'We could not safely resume checkout. Please try again in a moment.',
          reason: 'retrieve_failed',
          diagnostic: diagnosticMessage(error),
        };
      }
    }

    if (existing?.status === 'complete') {
      return {
        kind: 'blocked',
        status: 409,
        error:
          'Your payment for this cart is already processing. Give it a few seconds, then check My Entries.',
        reason: 'complete',
        diagnostic: `Checkout Session ${existing.id} is complete`,
      };
    }

    if (existing?.status === 'open') {
      if (existing.amount_total === expectedAmountCents && existing.url) {
        return { kind: 'ready', session: existing, reused: true, expiredSessionId: null };
      }
      try {
        await sessions.expire(existing.id);
        expiredSessionId = existing.id;
      } catch (error) {
        return {
          kind: 'blocked',
          status: 503,
          error: 'We could not safely resume checkout. Please try again in a moment.',
          reason: 'expire_failed',
          diagnostic: diagnosticMessage(error),
        };
      }
    } else if (existing && existing.status !== 'expired') {
      return {
        kind: 'blocked',
        status: 503,
        error: 'We could not safely resume checkout. Please try again in a moment.',
        reason: 'unexpected_status',
        diagnostic: `Unexpected prior Checkout Session status: ${existing.status}`,
      };
    }
  }

  return {
    kind: 'ready',
    session: await createReplacement(),
    reused: false,
    expiredSessionId,
  };
}
