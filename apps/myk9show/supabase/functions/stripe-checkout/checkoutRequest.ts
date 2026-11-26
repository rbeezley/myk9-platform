// Parse the stripe-checkout request body (MYK9-2447). Malformed JSON or a
// non-object body is the caller's fault and answers 400, never the catch-all
// 500. Field validation stays with the handler. Deno-free so it runs under vitest.

export type ParsedCheckoutBody =
  { ok: true; value: Record<string, unknown> } | { ok: false; error: 'Invalid JSON body' };

export function parseCheckoutBody(rawBody: string): ParsedCheckoutBody {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, error: 'Invalid JSON body' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'Invalid JSON body' };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

/** MP-20 (as stripe-refund-entry): the catch-all 500 never carries raw error text. */
export const CHECKOUT_FAILED_MESSAGE = 'Could not start checkout. Please try again.';
