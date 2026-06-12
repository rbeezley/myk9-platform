import { expect, test, type Page } from '@playwright/test';
import { TEST_USERS } from '../helpers/testUsers';

test.describe.configure({ mode: 'serial', timeout: 90000 });

const SHOW_ID = '3b91e282-6e45-4a89-9446-f6ebeb0bf62c';
const MOCK_CART_ID = 'e2e-mocked-entry-cart';

interface CapturedWrites {
  cartItem?: Record<string, unknown>;
}

async function signInAsExhibitor(page: Page) {
  const params = new URLSearchParams({ returnTo: `/shows/${SHOW_ID}/register` });
  await page.goto(`/sign-in?${params.toString()}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('credential-input').fill(TEST_USERS.EXHIBITOR.email);
  await page.getByTestId('continue-button').click();
  await expect(page.getByTestId('password-input')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('password-input').fill(TEST_USERS.EXHIBITOR.password);
  await page.getByTestId('sign-in-button').click();
  await page.waitForURL(url => !url.pathname.includes('/sign-in'), { timeout: 15000 });
  await page.waitForLoadState('domcontentloaded');
}

async function preventSharedEntryWrites(page: Page, captured: CapturedWrites) {
  await page.route('**/rest/v1/entry_carts**', async route => {
    const request = route.request();

    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: 'null',
      });
      return;
    }

    if (request.method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: MOCK_CART_ID,
          show_id: SHOW_ID,
          exhibitor_id: 'e2e-exhibitor-profile',
          status: 'active',
          expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          subtotal_cents: 0,
          platform_fee_cents: 0,
          total_cents: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          show: { id: SHOW_ID, name: 'E2E Online Entry Show' },
        }),
      });
      return;
    }

    if (request.method() === 'PATCH') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    await route.fallback();
  });

  await page.route('**/rest/v1/entry_cart_items**', async route => {
    const request = route.request();

    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }

    if (request.method() === 'POST') {
      captured.cartItem = request.postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'e2e-mocked-cart-item',
          cart_id: MOCK_CART_ID,
          dog_id: captured.cartItem.dog_id,
          class_id: captured.cartItem.class_id,
          handler_id: null,
          entry_fee_cents: captured.cartItem.entry_fee_cents,
          created_at: new Date().toISOString(),
          dog: null,
          class: null,
          handler: null,
        }),
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

  const firstClass = page
    .locator('label.myk9-level-chip')
    .filter({ hasText: /Novice A/i })
    .first();
  await expect(firstClass).toBeVisible({ timeout: 15000 });
  await firstClass.click();
  await expect(page.getByText(/1 selected/).first()).toBeVisible({ timeout: 10000 });
}

test('exhibitor card entry hands off to cart checkout without enrollment writes', async ({
  page,
}) => {
  const captured: CapturedWrites = {};
  await preventSharedEntryWrites(page, captured);
  await signInAsExhibitor(page);

  await expect(page).toHaveURL(new RegExp(`/shows/${SHOW_ID}/register`));
  await expect(page.getByRole('heading', { name: 'Register for Show' })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByText(/Step 1 of 3:/)).toBeVisible();

  await selectFirstAvailableClass(page);
  await page.getByRole('button', { name: /^Next$/ }).click();

  await expect(page.getByRole('heading', { name: 'Payment Information' })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByText('Total Due').locator('..')).toContainText(/\$\d+\.\d{2}/);
  await page.getByRole('button', { name: /Credit\/Debit Card \(Online Payment\)/i }).click();
  await expect(page.getByText(/secure checkout to complete payment/i).first()).toBeVisible();

  const agreement = page.getByText(/I have read and agree to the .* entry agreement/i);
  await expect(agreement).toBeVisible({ timeout: 15000 });
  await agreement.click();
  await expect(page.getByRole('button', { name: /^Next$/ })).toBeEnabled();

  await page.getByRole('button', { name: /^Next$/ }).click();

  await expect(page).toHaveURL(/\/cart$/, { timeout: 15000 });

  expect(captured.cartItem?.cart_id).toBe(MOCK_CART_ID);
  expect(typeof captured.cartItem?.entry_fee_cents).toBe('number');
  expect(captured.cartItem?.entry_fee_cents as number).toBeGreaterThan(0);
});
