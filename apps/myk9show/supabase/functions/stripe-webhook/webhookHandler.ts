// Request-level routing for the Stripe webhook entrypoint: method gating,
// signature verification (with platform/Connect secret fallback), dispatch
// to the event-type switch, and the outer error->alert->500 path.
//
// Extracted from the Deno.serve callback in index.ts (MYK9-41) so it can be
// unit-tested under vitest without a live Stripe client, Supabase client, or
// Deno env vars. Behavior is unchanged — index.ts wires this factory up with
// the real Stripe/Supabase deps and still calls Deno.serve(...) itself.
//
// Generic over the verified event type (rather than importing the `stripe`
// SDK's `Stripe.Event`) so this module — like the rest of _shared — stays
// Deno-free and importable from plain vitest; `stripe` is not a Node
// dependency of this workspace (it's loaded via Deno's `npm:` specifier at
// runtime). index.ts instantiates this with Stripe.Event via inference.
export interface WebhookHandlerDeps<TEvent extends { id: string }> {
  /** Verifies a raw body+signature against one secret; throws on mismatch. */
  verifyEvent: (body: string, signature: string, secret: string) => Promise<TEvent>;
  platformSecret: string;
  /** Optional Connect-scoped destination secret; tried only if platform verification fails. */
  connectSecret?: string;
  /** Business dispatch — the event.type switch. */
  dispatch: (event: TEvent) => Promise<void>;
  alertAdmin: (
    subject: string,
    html: string,
    opts: { source?: string; dedupeKey?: string; detail?: Record<string, unknown> }
  ) => Promise<void>;
}

/**
 * Platform-scoped and Connect-scoped destinations sign with different
 * secrets; try the platform secret first, then the Connect secret when
 * configured.
 */
export async function verifyWebhookSignature<TEvent extends { id: string }>(
  deps: Pick<WebhookHandlerDeps<TEvent>, 'verifyEvent' | 'platformSecret' | 'connectSecret'>,
  body: string,
  signature: string
): Promise<TEvent> {
  try {
    return await deps.verifyEvent(body, signature, deps.platformSecret);
  } catch (platformError) {
    if (!deps.connectSecret) throw platformError;
    // Log the platform-secret failure so a misconfigured PRIMARY secret isn't
    // masked by the Connect-secret error when both verifications fail.
    console.log(
      `Platform-secret verification failed (${platformError instanceof Error ? platformError.message : 'unknown'}); trying Connect secret`
    );
    return await deps.verifyEvent(body, signature, deps.connectSecret);
  }
}

/**
 * Builds the (Request -> Promise<Response>) handler that Deno.serve calls.
 * Exposed as a factory so tests can inject a fake verifier/dispatcher/alert
 * without touching Stripe, Supabase, or Deno.env.
 */
export function createWebhookRequestHandler<TEvent extends { id: string }>(
  deps: WebhookHandlerDeps<TEvent>
) {
  return async function handleWebhookRequest(req: Request): Promise<Response> {
    // Hoisted so the outer catch can dedupe re-deliveries: Stripe retries the
    // same event id on every non-2xx response, and each retry would otherwise
    // insert a fresh unresolved operator_alerts row. Stays null until
    // signature verification succeeds — a verification failure has no
    // trusted event id, so that path correctly stays keyless.
    let eventId: string | null = null;
    try {
      if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204 });
      }

      if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
      }

      const signature = req.headers.get('stripe-signature');
      if (!signature) {
        return new Response('No signature found', { status: 400 });
      }

      const body = await req.text();
      let event: TEvent;

      try {
        event = await verifyWebhookSignature(deps, body, signature);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Webhook signature verification failed: ${errorMessage}`);
        return new Response(`Webhook signature verification failed: ${errorMessage}`, {
          status: 400,
        });
      }
      eventId = event.id;

      await deps.dispatch(event);

      return Response.json({ received: true });
    } catch (error: unknown) {
      console.error('Error processing webhook:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      try {
        await deps.alertAdmin(
          'Webhook handler failed before acknowledgment',
          `<p>A Stripe webhook handler failed before returning 2xx, so Stripe should retry it.</p>
         <pre>${errorMessage}</pre>`,
          {
            source: 'stripe-webhook',
            dedupeKey: eventId ? `handler-failed-${eventId}` : undefined,
            detail: { eventId, message: errorMessage },
          }
        );
      } catch (alertError) {
        console.error('Webhook failure alert also failed:', alertError);
      }
      return Response.json({ error: errorMessage }, { status: 500 });
    }
  };
}
