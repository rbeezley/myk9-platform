import { expect, test, type Page } from '@playwright/test';
import { TEST_USERS } from '../helpers/testUsers';

test.describe.configure({ mode: 'serial', timeout: 90000 });

const SHOW_ID = '3b91e282-6e45-4a89-9446-f6ebeb0bf62c';
const MOCK_CART_ID = 'e2e-mocked-entry-cart';
const MOCK_ENROLLMENT_ID = 'e2e-mocked-online-entry-enrollment';
const MOCK_ENTRY_ID = 'e2e-mocked-online-entry';
const MOCK_CONFIRMATION = 'MK9-E2E777';

interface CapturedWrites {
  cartItem?: Record<string, unknown>;
  enrollment?: Record<string, unknown>;
  submitEntries?: {
    p_show_id?: string;
    p_registration_id?: string;
    p_entries?: Array<{
      dog_id?: string;
      class_id?: string;
      handler_name?: string;
      payment_method?: string;
      client_fee_cents?: number;
    }>;
    p_payment_method?: string;
  };
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
    const request = route.request();

    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: 'null',
      });
      return;
    }

    if (request.method() !== 'POST') {
      await route.fallback();
      return;
    }

    captured.enrollment = request.postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: MOCK_ENROLLMENT_ID,
        show_id: SHOW_ID,
        handler_id: captured.enrollment.handler_id,
        confirmation_number: MOCK_CONFIRMATION,
        payment_status: 'paid',
        payment_reference: captured.enrollment.payment_reference,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
  });

  await page.route('**/rest/v1/rpc/submit_show_entries', async route => {
    captured.submitEntries = route.request().postDataJSON() as CapturedWrites['submitEntries'];
    const firstEntry = captured.submitEntries?.p_entries?.[0];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        entries: [{ entry_id: MOCK_ENTRY_ID, dog_id: firstEntry?.dog_id }],
        registration_id: MOCK_ENROLLMENT_ID,
        submission_id: captured.submitEntries?.p_submission_id ?? 'e2e-submission',
      }),
    });
  });

  await page.route('**/rest/v1/rpc/assign_armband', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(777),
    });
  });

  await page.route('**/rest/v1/entries**', async route => {
    const request = route.request();
    if (request.method() === 'PATCH') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: MOCK_ENTRY_ID, armband: '777' }]),
      });
      return;
    }

    await route.fallback();
  });

  await page.route('**/functions/v1/send-registration-email', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });
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

test('exhibitor can enter an online show through confirmation without shared DB writes', async ({
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
  await expect(page.getByText(/Online card payment is coming soon/i).first()).toBeVisible();

  const agreement = page.getByText(/I have read and agree to the .* entry agreement/i);
  await expect(agreement).toBeVisible({ timeout: 15000 });
  await agreement.click();
  await expect(page.getByRole('button', { name: /^Next$/ })).toBeEnabled();

  await page.getByRole('button', { name: /^Next$/ }).click();

  await expect(page.getByRole('heading', { name: /Your entry is ready/i })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByText(new RegExp(`Entry\\s*#${MOCK_CONFIRMATION}`))).toBeVisible();
  await expect(page.getByText(/Container Novice A/)).toBeVisible();

  expect(captured.cartItem?.cart_id).toBe(MOCK_CART_ID);
  expect(typeof captured.cartItem?.entry_fee_cents).toBe('number');
  expect(captured.cartItem?.entry_fee_cents as number).toBeGreaterThan(0);
  expect(captured.enrollment?.show_id).toBe(SHOW_ID);
  expect(captured.enrollment?.handler_id).toBeTruthy();
  expect(captured.enrollment?.payment_reference).toBe('MOCK-PAYMENT-REF');
  expect(captured.submitEntries?.p_show_id).toBe(SHOW_ID);
  expect(captured.submitEntries?.p_registration_id).toBe(MOCK_ENROLLMENT_ID);
  expect(captured.submitEntries?.p_payment_method).toBe('credit_card');
  expect(captured.submitEntries?.p_entries).toHaveLength(1);
  expect(captured.submitEntries?.p_entries?.[0]?.payment_method).toBe('credit_card');
  expect(captured.submitEntries?.p_entries?.[0]?.client_fee_cents).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Complete Registration' }).click();
  await expect(page).toHaveURL(new RegExp(`/shows/${SHOW_ID}`));
});
