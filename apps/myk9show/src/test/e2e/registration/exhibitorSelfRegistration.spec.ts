import { expect, test, type Page } from '@playwright/test';
import { signInAsExhibitor } from '../helpers/testUsers';
import { LIVE_REGISTRATION_SHOW_ID } from '../uat/shared/seededShows';
import { installSharedStagingWriteGuard } from '../helpers/sharedStagingWriteGuard';

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

async function selectFirstAvailableClass(page: Page) {
  await expect(page.getByRole('heading', { name: 'Select Classes' })).toBeVisible({
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
  await page.clock.setFixedTime(
    new Date(process.env.QA_REGISTRATION_TIME ?? '2026-05-15T12:00:00.000Z')
  );

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
  await expect(page.getByText('Entry fee total').locator('..')).toContainText(/\$\d+\.\d{2}/);
  const cardPayment = page.getByRole('button', {
    name: /Credit\/Debit Card \(Online Payment\)/i,
  });
  await expect(cardPayment).toBeVisible();
  await cardPayment.evaluate((button: HTMLElement) => button.click());
  await expect(page.getByText(/secure checkout to complete payment/i).first()).toBeVisible();

  // The payment review must disclose the same service fee at every audited width.
  const entryTotal = page.getByText('Entry fee total').locator('..');
  const amountDue = page.getByText('Amount Due:').locator('..');
  const entryDollars = Number((await entryTotal.innerText()).match(/\$([\d.]+)/)?.[1]);
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    const serviceFee = page.getByText(/^Service fee \(/).locator('..');
    await expect(serviceFee).toBeVisible();
    const feeDollars = Number((await serviceFee.innerText()).match(/\$([\d.]+)\s*$/)?.[1]);
    await expect(amountDue).toContainText(`$${(entryDollars + feeDollars).toFixed(2)}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width
    );
    await test.info().attach(`wizard-${viewport.width}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  }
  const quotedTotal = (await amountDue.innerText()).match(/\$[\d.]+/)?.[0];
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
