import type { Locator, Page } from '@playwright/test';
import {
  classifyCheckout,
  confirmedUnpaid,
  describeCheckoutState,
  mayRetryPay,
  type CheckoutSnapshot,
  type PaymentEvidence,
} from './stripeCheckoutState';

/** Where a wait-list payer lands after Stripe accepts the payment. */
const FIRST_WAIT_MS = 20_000;
const PROCESSING_WAIT_MS = 70_000;
const RETRY_WAIT_MS = 60_000;

export interface SubmitOptions {
  returnOrigin: string;
  /** Re-resolves the Pay button; the page may have re-rendered since the first click. */
  findPay: () => Promise<Locator>;
  /** Reads the payment state fresh; a retry happens only if this proves nothing was paid. */
  readPaymentEvidence: () => Promise<PaymentEvidence>;
}

function roots(page: Page) {
  return [page, ...page.frames().filter(frame => frame !== page.mainFrame())];
}

async function anyVisible(page: Page, build: (root: ReturnType<typeof roots>[number]) => Locator) {
  for (const root of roots(page)) {
    try {
      if (await build(root).first().isVisible({ timeout: 500 })) return true;
    } catch {
      // frame navigated or detached mid-check; the next read sees the new state
    }
  }
  return false;
}

/** Reads the page without changing it. Never throws: an unreadable frame counts as "not shown". */
export async function readCheckoutSnapshot(page: Page): Promise<CheckoutSnapshot> {
  let errorText: string | null = null;
  for (const root of roots(page)) {
    try {
      const alert = root.locator('[role="alert"], [class*="Error" i]').first();
      if (await alert.isVisible({ timeout: 500 })) {
        const text = ((await alert.innerText({ timeout: 1_000 })) ?? '').trim();
        if (text) {
          errorText = text.replace(/\s+/g, ' ').slice(0, 160);
          break;
        }
      }
    } catch {
      // see anyVisible
    }
  }
  const linkFrame = page
    .frames()
    .some(frame => /link/i.test(frame.name()) || /link\.com|stripe-link/i.test(frame.url()));
  let emailFocused = false;
  for (const root of roots(page)) {
    try {
      emailFocused = await root
        .locator('#email, input[name="email"], input[autocomplete="email"]')
        .first()
        .evaluate(el => el === el.ownerDocument.activeElement, undefined, { timeout: 500 });
      if (emailFocused) break;
    } catch {
      // no Email field in this root
    }
  }
  const pay = await anyVisible(page, root =>
    root
      .getByRole('button', { name: /^Pay(\s+\$[\d,.]+)?$/ })
      .and(root.locator('[disabled], [aria-busy="true"]'))
  );
  return {
    payBusy: pay,
    spinnerShown: await anyVisible(page, root =>
      root.locator('[role="progressbar"], [aria-busy="true"], [class*="Spinner" i]')
    ),
    errorText,
    linkOverlay:
      linkFrame ||
      (await anyVisible(page, root =>
        root.getByRole('dialog').or(root.getByText(/verification code|enter the code/i))
      )),
    emailFocused,
  };
}

/**
 * Clicks Pay and waits for the return redirect. When it does not come, says what the page was
 * doing, and clicks Pay once more only if the page is quiet AND Stripe and the payment link both
 * say nothing was paid. It never clicks a second time on a processing page, so it cannot pay twice.
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

  let snapshot = await readCheckoutSnapshot(page);
  let state = classifyCheckout(snapshot);
  console.log(
    `Stripe Checkout: no redirect ${FIRST_WAIT_MS / 1000}s after Pay; ${describeCheckoutState(state, snapshot)}`
  );

  if (state === 'processing') {
    if (await returned(PROCESSING_WAIT_MS)) return;
    snapshot = await readCheckoutSnapshot(page);
    state = classifyCheckout(snapshot);
    throw new Error(
      `Stripe Checkout never redirected; the page is ${describeCheckoutState(state, snapshot)}.`
    );
  }
  if (!mayRetryPay(state)) {
    throw new Error(
      `Stripe Checkout did not redirect; the page shows ${describeCheckoutState(state, snapshot)}.`
    );
  }

  const evidence = await options.readPaymentEvidence();
  if (!confirmedUnpaid(evidence)) {
    // Paid (or unknowable): a second click could charge twice, so only wait.
    if (await returned(PROCESSING_WAIT_MS)) return;
    throw new Error(
      `Stripe Checkout did not redirect; the page is ${describeCheckoutState(state, snapshot)}, ` +
        `link status "${evidence.linkStatus}", session payment_status "${evidence.sessionPaymentStatus}". Not retried: payment is not confirmed unpaid.`
    );
  }
  console.log('Stripe Checkout: confirmed unpaid and idle; clicking Pay once more');
  await (await options.findPay()).click();
  if (await returned(RETRY_WAIT_MS)) return;
  snapshot = await readCheckoutSnapshot(page);
  state = classifyCheckout(snapshot);
  throw new Error(
    `Stripe Checkout did not redirect after one Pay retry; the page is ${describeCheckoutState(state, snapshot)}.`
  );
}
