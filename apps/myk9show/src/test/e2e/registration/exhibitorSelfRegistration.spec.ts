import { expect, test, type Page } from '@playwright/test';
import { signInAsExhibitor } from '../helpers/testUsers';
import { LIVE_REGISTRATION_SHOW_ID } from '../uat/shared/seededShows';
import { installSharedStagingWriteGuard } from '../helpers/sharedStagingWriteGuard';
import { applyRegistrationClock } from './seedRoster';

test.describe.configure({ mode: 'serial', timeout: 90000 });

const SHOW_ID = LIVE_REGISTRATION_SHOW_ID;
const MOCK_CART_ID = 'e2e-mocked-entry-cart';
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];

interface CapturedWrites {
  cartItem?: Record<string, unknown>;
}

async function preventSharedEntryWrites(page: Page, captured: CapturedWrites) {
  let cart: Record<string, unknown> | null = null;
  let cartItem: Record<string, unknown> | null = null;
  await installSharedStagingWriteGuard(page, { strictRpcWrites: true });
  await page.route('**/functions/v1/**', route => route.abort());
  await page.route('**/rest/v1/entry_carts**', async route => {
    const request = route.request();

    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(cart),
      });
      return;
    }

    if (request.method() === 'POST') {
      cart = {
        ...request.postDataJSON(),
        id: MOCK_CART_ID,
        show_id: SHOW_ID,
        status: 'active',
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        subtotal_cents: 0,
        platform_fee_cents: 0,
        total_cents: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        show: { id: SHOW_ID, name: 'E2E Online Entry Show' },
      };
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(cart),
      });
      return;
    }

    if (request.method() === 'PATCH') {
      if (cart) Object.assign(cart, request.postDataJSON());
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    await route.fallback();
  });

  await page.route('**/rest/v1/entry_cart_items**', async route => {
    const request = route.request();

    if (request.method() === 'DELETE') {
      cartItem = null;
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(cartItem ? [cartItem] : []),
      });
      return;
    }

    if (request.method() === 'POST') {
      captured.cartItem = request.postDataJSON() as Record<string, unknown>;
      cartItem = {
        ...captured.cartItem,
        id: 'e2e-mocked-cart-item',
        cart_id: MOCK_CART_ID,
        handler_id: null,
        created_at: new Date().toISOString(),
        dog: null,
        class: null,
        handler: null,
      };
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(cartItem),
      });
      return;
    }

    await route.fallback();
  });

  await page.route('**/rest/v1/enrollments**', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: 'null',
      });
      return;
    }

    await route.abort();
  });
  await page.route('**/rest/v1/rpc/submit_show_entries', route => route.abort());
  await page.route('**/rest/v1/rpc/assign_armband', route => route.abort());
  await page.route('**/functions/v1/send-registration-email', route => route.abort());
}

/**
 * The one running entries panel (MYK9-483 / #2210). Above 1024px it is the
 * sticky aside; below it the aside is `display:none` and the same totals live
 * inside the collapsed bottom bar, mounted only while Details is expanded.
 * Both carry `aria-label="Your entries"`, so a page-level `getByText` on a
 * total is ambiguous — always scope to one of them.
 */
function entriesTotals(page: Page) {
  return page.getByTestId('entries-panel');
}

/**
 * Returns the entries-panel region that actually renders the totals at `width`,
 * expanding the phone/tablet bar's Details disclosure when that is the one.
 */
async function openEntriesTotals(page: Page, width: number) {
  if (width >= 1024) return entriesTotals(page);

  const bar = page.getByTestId('entries-panel-bar');
  const details = page.getByTestId('entries-panel-details');
  await expect(details).toBeVisible();
  if ((await details.getAttribute('aria-expanded')) !== 'true') {
    await details.click();
  }
  await expect(page.getByTestId('entries-panel-details-list')).toBeVisible();
  return bar;
}

/**
 * Put the phone/tablet bar back the way an exhibitor first meets it. The
 * overflow assertion and the attached screenshot must measure the COLLAPSED
 * bar, not the expanded panel this spec opened to read the totals (MYK9-545).
 */
async function collapseEntriesTotals(page: Page, width: number) {
  if (width >= 1024) return;
  const details = page.getByTestId('entries-panel-details');
  if ((await details.getAttribute('aria-expanded')) === 'true') {
    await details.click();
  }
  await expect(page.getByTestId('entries-panel-details-list')).toBeHidden();
}

async function selectFirstAvailableClass(page: Page) {
  await expect(page.getByRole('heading', { name: 'Select Classes', exact: true })).toBeVisible({
    timeout: 15000,
  });

  const classOptions = page.getByRole('checkbox', { name: /^Select / });
  await expect(classOptions.first()).toBeVisible({ timeout: 15000 });

  const count = await classOptions.count();
  for (let index = 0; index < count; index += 1) {
    const option = classOptions.nth(index);
    if ((await option.isVisible()) && (await option.isEnabled())) {
      await option.click();
      await expect(page.getByRole('button', { name: /^Next$/ })).toBeEnabled({
        timeout: 10000,
      });
      return;
    }
  }

  throw new Error('No enabled class checkbox was available for checkout handoff smoke');
}

async function selectFirstAvailableDog(page: Page) {
  await expect(page.getByRole('heading', { name: 'Select Dogs to Register' })).toBeVisible({
    timeout: 15000,
  });

  const namedDogOptions = page.locator('[role="checkbox"][aria-label^="Select "]');
  if ((await namedDogOptions.count()) > 0) {
    await expect(namedDogOptions.first()).toBeVisible({ timeout: 15000 });
    await namedDogOptions.first().click();
  } else {
    const dogOptions = page.getByRole('checkbox');
    await expect(dogOptions.first()).toBeVisible({ timeout: 15000 });
    await dogOptions.first().click();
  }
  await expect(page.getByRole('button', { name: /^Next$/ })).toBeEnabled({ timeout: 10000 });
}

test('exhibitor card entry hands off to cart checkout without enrollment writes', async ({
  page,
}) => {
  // MYK9-545: the fallback used to be a fixed '2026-05-15'. The seed's entry
  // window is relative (CURRENT_DATE - 16 .. + 76), so after any reseed past
  // that date the wizard rendered "This show is not accepting online entries
  // yet" and step 1 never appeared. Real time is always inside the window;
  // QA_REGISTRATION_TIME still pins a moment for a hand run.
  await applyRegistrationClock(page);

  const captured: CapturedWrites = {};
  await preventSharedEntryWrites(page, captured);
  await signInAsExhibitor(page, `/shows/${SHOW_ID}/register`);

  await expect(page).toHaveURL(new RegExp(`/shows/${SHOW_ID}/register`));
  await expect(page.getByRole('heading', { name: 'Register for Show' })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByText('Step 1 of 4', { exact: true })).toBeVisible();

  await selectFirstAvailableDog(page);
  await page.getByRole('button', { name: /^Next$/ }).click();
  await selectFirstAvailableClass(page);
  await page.getByRole('button', { name: /^Next$/ }).click();

  await expect(page.getByRole('heading', { name: 'Payment Information' })).toBeVisible({
    timeout: 15000,
  });
  await expect(
    entriesTotals(page).getByText('Entry fees', { exact: true }).locator('..')
  ).toContainText(/\$\d+\.\d{2}/);
  const cardPayment = page.getByRole('button', {
    name: /Credit\/Debit Card \(Online Payment\)/i,
  });
  await expect(cardPayment).toBeVisible();
  await cardPayment.evaluate((button: HTMLElement) => button.click());
  await expect(page.getByText(/secure checkout to complete payment/i).first()).toBeVisible();

  // The payment review must disclose the same service fee at every audited width.
  // MYK9-483 (#2210) moved the fee summary into the one running entries panel:
  // the desktop aside above 1024px, and a collapsed bar below it whose totals
  // only mount once Details is expanded. The labels moved with it
  // ("Entry fee total" -> "Entry fees", "Amount Due:" -> "Total due").
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    const totals = await openEntriesTotals(page, viewport.width);
    const amountDue = totals.getByText('Total due', { exact: true }).locator('..');
    const entryFees = totals.getByText('Entry fees', { exact: true }).locator('..');
    const serviceFee = totals.getByText(/^Service fee \(/).locator('..');
    // Read each figure from the region that is actually mounted at this width,
    // and only once it carries a price — a read taken before the totals settle
    // yields NaN and the comparison then asserts "$NaN" against real money.
    await expect(entryFees).toContainText(/\$\d+\.\d{2}/);
    await expect(serviceFee).toBeVisible();
    const entryDollars = Number((await entryFees.innerText()).match(/\$([\d.]+)/)?.[1]);
    const feeDollars = Number((await serviceFee.innerText()).match(/\$([\d.]+)\s*$/)?.[1]);
    expect(Number.isFinite(entryDollars) && Number.isFinite(feeDollars)).toBe(true);
    await expect(amountDue).toContainText(`$${(entryDollars + feeDollars).toFixed(2)}`);
    await collapseEntriesTotals(page, viewport.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width
    );
    await test.info().attach(`wizard-${viewport.width}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  }
  // The width loop leaves the page on the narrowest viewport, where the
  // entries-panel bar is sticky to the bottom of the wizard and intercepts the
  // pointer on everything underneath it — including the agreement label. Go
  // back to the widest audited width before driving the rest of the journey.
  await page.setViewportSize(VIEWPORTS[0]!);
  const finalTotals = await openEntriesTotals(page, VIEWPORTS[0]!.width);
  const quotedTotal = (
    await finalTotals.getByText('Total due', { exact: true }).locator('..').innerText()
  ).match(/\$[\d.]+/)?.[0];
  expect(quotedTotal).toBeTruthy();

  const agreement = page.getByText(/I have read and agree to the .* entry agreement/i);
  await expect(agreement).toBeVisible({ timeout: 15000 });
  await agreement.click();
  const submitAndPay = page.getByRole('button', { name: /^Submit & pay$/ });
  await expect(submitAndPay).toBeEnabled();

  await submitAndPay.click();

  await expect(page).toHaveURL(/\/cart$/, { timeout: 15000 });
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await expect(page.getByText('Total', { exact: true }).locator('..')).toContainText(
      quotedTotal!
    );
    await expect(
      page.getByRole('button', { name: new RegExp(`Pay.*${quotedTotal!.replace('$', '\\$')}`) })
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width
    );
    await test.info().attach(`cart-${viewport.width}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  }

  expect(captured.cartItem?.cart_id).toBe(MOCK_CART_ID);
  expect(typeof captured.cartItem?.entry_fee_cents).toBe('number');
  expect(captured.cartItem?.entry_fee_cents as number).toBeGreaterThan(0);
});
