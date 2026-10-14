import { createHmac } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import {
  assertNoSharedWebhookEndpoints,
  WEBHOOK_ENDPOINT_PAGE_LIMIT,
  type StripeWebhookEndpointPage,
} from './stripeWebhookEndpointGuard';

export { assertNoSharedWebhookEndpoints };

/**
 * Stripe test-mode plumbing for the wait-list journey's paid leg (MYK9-971).
 *
 * The paid leg runs the REAL path: the exhibitor's "Complete payment" calls the local
 * `stripe-payment-link`, which creates a test-mode Checkout Session with the sandbox key; the
 * browser pays on Stripe's hosted page with Stripe's published test card; and the local
 * `stripe-webhook` settles it. Two things here exist only because the runner is not a public
 * deployment, and neither touches money logic:
 *
 * 1. Return URL. `stripe-payment-link` accepts success/cancel URLs only on its allow-listed
 *    origins, and the Nightly preview serves on `localhost:4173`, which is not one. The request
 *    body's return URLs are re-pointed at the allow-listed `localhost:5173`, and that origin is
 *    answered locally when Stripe redirects back. The function's checks run unchanged.
 * 2. Webhook delivery. Stripe cannot reach the runner. The spec reads the event Stripe really
 *    recorded for the session from the Events API and delivers it to the local `stripe-webhook`,
 *    signed with the local dummy signing secret. The webhook still re-retrieves the session from
 *    Stripe and settles only on `payment_status: 'paid'`, so nothing here can fake a payment.
 *
 * The key is read from the environment and only ever sent to api.stripe.com; it is never logged,
 * put in an assertion message, or handed to the browser.
 */

const STRIPE_API = 'https://api.stripe.com/v1';
/** An origin `stripe-payment-link` allows as a return URL; nothing serves it on the runner. */
const ALLOWED_RETURN_ORIGIN = 'http://localhost:5173';
/** Stripe's published test card: always succeeds, no 3-D Secure. */
const TEST_CARD = { number: '4242424242424242', expiry: '12 / 34', cvc: '123', zip: '74101' };

/** The sandbox key, or null when this run has none. Anything but `sk_test_` fails loudly. */
export function stripeTestKey(): string | null {
  const key = process.env.STRIPE_TEST_SECRET_KEY?.trim();
  if (!key) return null;
  if (!key.startsWith('sk_test_')) {
    throw new Error('STRIPE_TEST_SECRET_KEY is set but is not a Stripe test-mode (sk_test_) key.');
  }
  return key;
}

function rehome(url: unknown): unknown {
  if (typeof url !== 'string') return url;
  const parsed = new URL(url);
  return `${ALLOWED_RETURN_ORIGIN}${parsed.pathname}${parsed.search}`;
}

/** The headers `stripe-payment-link`'s own `getCorsHeaders()` allows; used when no preflight names any. */
const PAYMENT_LINK_ALLOW_HEADERS =
  'authorization, x-client-info, apikey, content-type, x-function-secret';

/**
 * See (1) above. Install on the exhibitor's page before "Complete payment".
 *
 * The call still comes from the preview origin, which the function's `getCorsHeaders()` also does
 * not list (it answers `Access-Control-Allow-Origin: https://myk9show.com`), so the browser could
 * not read the session URL. So this route answers the preflight itself, sends the rewritten POST
 * from the test runner (`route.fetch`, which no CORS policy applies to), and hands the function's
 * real response back with the page's origin allowed. Status and body are the function's own.
 */
export async function routeStripeReturnThroughAllowedOrigin(page: Page): Promise<void> {
  await page.route('**/functions/v1/stripe-payment-link', async route => {
    const request = route.request();
    const headers = await request.allHeaders();
    const origin = headers.origin ?? new URL(page.url()).origin;
    const cors = {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers':
        headers['access-control-request-headers'] ?? PAYMENT_LINK_ALLOW_HEADERS,
      vary: 'Origin',
    };
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    if (request.method() !== 'POST') {
      await route.fallback();
      return;
    }
    const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
    const response = await route.fetch({
      postData: JSON.stringify({
        ...body,
        success_url: rehome(body.success_url),
        cancel_url: rehome(body.cancel_url),
      }),
    });
    await route.fulfill({ response, headers: { ...response.headers(), ...cors } });
  });
  await page.route(`${ALLOWED_RETURN_ORIGIN}/**`, route =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>Back from Stripe</title>',
    })
  );
}

/** Pays the hosted Checkout page the browser is on, then waits for Stripe's success redirect. */
export async function payOnStripeCheckout(page: Page): Promise<string> {
  await page.waitForURL(/^https:\/\/checkout\.stripe\.com\//, { timeout: 30_000 });
  const email = page.locator('#email');
  await expect(email).toBeVisible({ timeout: 30_000 });
  await email.fill(`waitlist-journey-${Date.now()}@example.com`);

  // With dynamic payment methods the card form sits behind an accordion item named "Card".
  const cardNumber = page.locator('#cardNumber');
  if (!(await cardNumber.isVisible())) {
    await page
      .getByRole('button', { name: /^card$/i })
      .or(page.getByRole('radio', { name: /^card$/i }))
      .click();
  }

  await cardNumber.fill(TEST_CARD.number);
  await page.locator('#cardExpiry').fill(TEST_CARD.expiry);
  await page.locator('#cardCvc').fill(TEST_CARD.cvc);
  await page.locator('#billingName').fill('Waitlist Journey');
  const zip = page.locator('#billingPostalCode');
  if (await zip.isVisible()) await zip.fill(TEST_CARD.zip);
  // Link's "save my info" would ask for a phone number; this payer saves nothing.
  const saveWithLink = page.locator('#enableStripePass');
  if ((await saveWithLink.isVisible()) && (await saveWithLink.isChecked())) {
    await saveWithLink.uncheck();
  }

  // The submit button reads "Pay" (or "Pay $NN.NN"); "Pay with ..." is a payment-method choice.
  await page.getByRole('button', { name: /^Pay\b(?! with)/ }).click();
  await page.waitForURL(url => url.origin === ALLOWED_RETURN_ORIGIN, { timeout: 90_000 });
  const returned = new URL(page.url());
  return `${returned.pathname}${returned.search}`;
}

interface StripeEvent {
  id: string;
  type: string;
  data: { object: { id?: string } };
}

async function stripeGet<T>(key: string, path: string): Promise<T> {
  const response = await fetch(`${STRIPE_API}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const body = (await response.json()) as T & { error?: { message?: string } };
  // Stripe masks keys in its own error messages; only the status and that message are reported.
  expect(response.status, `Stripe GET ${path.split('?')[0]}: ${body.error?.message ?? ''}`).toBe(
    200
  );
  return body;
}

/**
 * Fails, never skips, when the sandbox would deliver this run's payment to a shared project. Call
 * before anything creates a Checkout Session (stripeWebhookEndpointGuard.ts says why).
 */
export async function assertSandboxHasNoSharedWebhookEndpoints(): Promise<void> {
  const key = stripeTestKey();
  if (!key) throw new Error('STRIPE_TEST_SECRET_KEY is required to check the sandbox endpoints.');
  assertNoSharedWebhookEndpoints(
    await stripeGet<StripeWebhookEndpointPage>(
      key,
      `/webhook_endpoints?limit=${WEBHOOK_ENDPOINT_PAGE_LIMIT}`
    )
  );
}

/** The `checkout.session.completed` Stripe recorded for this session (it can lag a few seconds). */
async function completedEventFor(key: string, sessionId: string): Promise<StripeEvent> {
  let found: StripeEvent | undefined;
  await expect(async () => {
    const page = await stripeGet<{ data: StripeEvent[] }>(
      key,
      '/events?type=checkout.session.completed&limit=100'
    );
    found = page.data.find(event => event.data.object.id === sessionId);
    expect(found, `Stripe has no checkout.session.completed for ${sessionId} yet`).toBeTruthy();
  }).toPass({ timeout: 60_000 });
  return found!;
}

/** Stripe's `Stripe-Signature` scheme: HMAC-SHA256 over `<t>.<payload>` with the signing secret. */
export function stripeSignatureHeader(payload: string, secret: string, timestamp: number): string {
  const v1 = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

/** See (2) above: the real event, delivered to the local webhook as Stripe would deliver it. */
export async function deliverCheckoutCompleted(sessionId: string): Promise<void> {
  const key = stripeTestKey();
  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? '';
  const webhookSecret = process.env.MYK9_E2E_STRIPE_WEBHOOK_SECRET ?? '';
  if (!key || !supabaseUrl || !webhookSecret) {
    throw new Error(
      'Delivering the webhook needs STRIPE_TEST_SECRET_KEY, VITE_SUPABASE_URL and ' +
        'MYK9_E2E_STRIPE_WEBHOOK_SECRET (scripts/qa/isolated-e2e-lifecycle.ts).'
    );
  }
  const session = await stripeGet<{ payment_status: string }>(
    key,
    `/checkout/sessions/${sessionId}`
  );
  expect(session.payment_status, 'Stripe says the hosted Checkout payment settled').toBe('paid');

  const payload = JSON.stringify(await completedEventFor(key, sessionId));
  const response = await fetch(`${supabaseUrl}/functions/v1/stripe-webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': stripeSignatureHeader(
        payload,
        webhookSecret,
        Math.floor(Date.now() / 1000)
      ),
    },
    body: payload,
  });
  const body = await response.text();
  expect(response.status, `stripe-webhook: ${body}`).toBe(200);
  expect(JSON.parse(body)).toEqual({ received: true });
}
