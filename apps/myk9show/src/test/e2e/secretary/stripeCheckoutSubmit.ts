import { test, type Locator, type Page } from '@playwright/test';
import { decidePayFollowUp, type PaymentEvidence } from './stripeCheckoutState';

const FIRST_WAIT_MS = 20_000;
const LATE_WAIT_MS = 60_000;
const RETRY_WAIT_MS = 45_000;
const RETRY_CLICK_MS = 10_000;
const TEXT_LIMIT = 4_000;

export interface SubmitOptions {
  returnOrigin: string;
  /** Re-resolves the Pay button; the page may have re-rendered since the first click. */
  findPay: () => Promise<Locator>;
  /** Reads Stripe's PaymentIntent status fresh; null status means never click again. */
  readPaymentEvidence: () => Promise<PaymentEvidence>;
}

/**
 * Diagnostics that survive the artifact upload (trace zips are excluded there: they record typed
 * passwords). A full-page screenshot and the visible text only; no cookies, no storage. innerText
 * holds no input values, so the typed email and card number are not in the text.
 */
async function attachDiagnostics(page: Page): Promise<void> {
  const info = test.info();
  try {
    await info.attach('stripe-checkout.png', {
      body: await page.screenshot({ fullPage: true, timeout: 10_000 }),
      contentType: 'image/png',
    });
  } catch {
    // the page may be gone; the error message still names the state
  }
  try {
    const parts: string[] = [];
    for (const frame of page.frames()) {
      const text = await frame
        .locator('body')
        .innerText({ timeout: 2_000 })
        .catch(() => '');
      if (text.trim()) parts.push(text.trim());
    }
    await info.attach('stripe-checkout-text.txt', {
      body: parts.join('\n---\n').slice(0, TEXT_LIMIT),
      contentType: 'text/plain',
    });
  } catch {
    // diagnostics never mask the failure they describe
  }
}

async function fail(
  page: Page,
  step: string,
  status: string | null,
  detail: string
): Promise<never> {
  await attachDiagnostics(page);
  throw new Error(
    `Stripe Checkout did not redirect (step: ${step}; PaymentIntent status: ${status ?? 'unknown'}). ${detail}`
  );
}

/**
 * Clicks Pay and waits for the return redirect. With no redirect after 20s, Stripe's PaymentIntent
 * decides: in flight or done means wait; unstarted means click Pay once more; anything else fails.
 * It never clicks a second time unless Stripe shows the payment unstarted, so it cannot pay twice.
 */
export async function submitPaymentAndAwaitReturn(
  page: Page,
  pay: Locator,
  options: SubmitOptions
): Promise<void> {
  const returned = (ms: number) =>
    page
      .waitForURL(url => url.origin === options.returnOrigin, { timeout: ms })
      .then(
        () => true,
        () => false
      );
  await pay.click();
  if (await returned(FIRST_WAIT_MS)) return;

  const evidence = await options.readPaymentEvidence();
  const status = evidence.paymentIntentStatus;
  const decision = decidePayFollowUp(evidence);
  console.log(
    `Stripe Checkout: no redirect ${FIRST_WAIT_MS / 1000}s after Pay; PI ${status}, ${decision}`
  );

  if (decision === 'fail') {
    return fail(
      page,
      'after the first Pay click',
      status,
      'Not retried: Stripe shows a status that is neither in flight nor unstarted.'
    );
  }
  if (decision === 'wait') {
    if (await returned(LATE_WAIT_MS)) return;
    return fail(
      page,
      'waiting for a late redirect',
      status,
      'The return never came; no second click was made.'
    );
  }
  try {
    await (await options.findPay()).click({ timeout: RETRY_CLICK_MS });
  } catch (error) {
    return fail(
      page,
      'the Pay retry click',
      status,
      `The click failed: ${String(error).slice(0, 300)}`
    );
  }
  if (await returned(RETRY_WAIT_MS)) return;
  const after = (await options.readPaymentEvidence()).paymentIntentStatus;
  return fail(
    page,
    'after the Pay retry',
    status,
    `PaymentIntent before retry: ${status}, now: ${after ?? 'unknown'}. One retry was made; none more.`
  );
}
