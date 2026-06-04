import { test, expect, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial', timeout: 90000 });

const SECRETARY_EMAIL = 'secretary@myk9t.com';
const SECRETARY_PASSWORD = 'TestPass4567!';
const SHOW_ID = '4584f257-19b5-4016-aae6-5e7827b769cb';
const DOG_SEARCH = 'Bravo';
const MOCK_CART_ID = 'e2e-single-dog-cart';

async function signInAsSecretary(page: Page, returnTo = '/secretary/dashboard') {
  await page.goto(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.getByTestId('credential-input').fill(SECRETARY_EMAIL);
  await page.getByTestId('continue-button').click();
  await expect(page.getByTestId('password-input')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('password-input').fill(SECRETARY_PASSWORD);
  await page.getByTestId('sign-in-button').click();
  await page.waitForURL(url => !url.pathname.includes('/sign-in'), { timeout: 15000 });
  await page.waitForLoadState('domcontentloaded');
}

async function preventSharedWrites(page: Page) {
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
          exhibitor_id: 'e2e-single-dog-exhibitor',
          status: 'active',
          expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          subtotal_cents: 0,
          platform_fee_cents: 0,
          total_cents: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
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
      const requestBody = request.postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'e2e-single-dog-cart-item',
          cart_id: MOCK_CART_ID,
          dog_id: requestBody.dog_id,
          class_id: requestBody.class_id,
          handler_id: null,
          entry_fee_cents: requestBody.entry_fee_cents,
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
    if (request.method() !== 'POST') return route.fallback();

    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'e2e-mocked-enrollment',
        show_id: SHOW_ID,
        handler_id: 'e2e-mocked-handler',
        confirmation_number: 'MK9-E2E001',
        payment_status: 'paid',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
  });

  await page.route('**/rest/v1/rpc/submit_show_entries', async route => {
    const request = route.request();
    const payload = request.postDataJSON() as {
      p_registration_id?: string;
      p_submission_id?: string;
      p_entries?: Array<{ dog_id: string }>;
    };

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        entries: (payload.p_entries ?? []).map((entry, index) => ({
          entry_id: `e2e-mocked-entry-${index + 1}`,
          dog_id: entry.dog_id,
        })),
        registration_id: payload.p_registration_id ?? 'e2e-mocked-enrollment',
        submission_id: payload.p_submission_id ?? 'e2e-mocked-submission',
      }),
    });
  });

  await page.route('**/rest/v1/rpc/assign_armband', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify('9001'),
    });
  });

  await page.route('**/rest/v1/entries**', async route => {
    const request = route.request();
    if (request.method() !== 'PATCH') return route.fallback();

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 'e2e-mocked-entry-1', armband: '9001' }]),
    });
  });
}

async function gotoSecretaryRegistration(page: Page) {
  if (!new URL(page.url()).pathname.startsWith(`/secretary/register/${SHOW_ID}`)) {
    await page.goto(`/secretary/register/${SHOW_ID}`, { waitUntil: 'domcontentloaded' });
  }
  await expect(page.getByRole('heading', { name: 'Register for Show' })).toBeVisible({
    timeout: 15000,
  });
}

async function searchAndSelectDog(page: Page) {
  const search = page.getByPlaceholder(/Search all dogs/i);
  await expect(search).toBeVisible();
  await search.fill(DOG_SEARCH);
  await waitForDogSearch(page, DOG_SEARCH.toLowerCase());

  const dogCheckbox = page.getByRole('checkbox', { name: new RegExp(`Select ${DOG_SEARCH}`, 'i') });
  await expect(dogCheckbox).toBeVisible({ timeout: 10000 });
  await dogCheckbox.click({ force: true });
  await expect(page.getByText(/1(?: dog)? selected/).first()).toBeVisible({ timeout: 5000 });
}

async function selectFirstInteriorClass(page: Page) {
  await expect(page.getByRole('heading', { name: 'Select Classes' })).toBeVisible({
    timeout: 10000,
  });

  const interiorCard = page.locator('.myk9-element-card').filter({ hasText: 'Interior' }).first();
  await expect(interiorCard).toBeVisible({ timeout: 10000 });
  await interiorCard.locator('label.myk9-level-chip').filter({ hasText: 'Novice A' }).click();
  await expect(page.getByText(/1 selected/).first()).toBeVisible();
}

test('reaches payment with one selected dog and one selected class', async ({ page }) => {
  await preventSharedWrites(page);
  await signInAsSecretary(page, `/secretary/register/${SHOW_ID}`);
  await gotoSecretaryRegistration(page);

  await expect(page.getByRole('heading', { name: 'Select Dogs to Register' })).toBeVisible();
  await searchAndSelectDog(page);
  await page.getByRole('button', { name: /^Next/ }).click();

  await selectFirstInteriorClass(page);
  await page.getByRole('button', { name: /^Next/ }).click();

  await expect(page.getByText(/All entries have handlers assigned/i)).toBeVisible({
    timeout: 5000,
  });
  await page.getByRole('button', { name: /^Next/ }).click();

  await expect(page.getByRole('heading', { name: 'Payment Information' })).toBeVisible();
  await page.getByRole('button', { name: /Secretary Payment \(Already Received\)/i }).click();
  await expect(page.getByText('Total Due').locator('..')).toContainText(/\$\d+\.\d{2}/);
  await expect(page.getByText(/Bravo/).first()).toBeVisible();
  await expect(page.getByText(/Interior Novice A/)).toBeVisible();

  const exhibitorAgreement = page.getByText(/The exhibitor has read and agrees/i);
  if (await exhibitorAgreement.isVisible().catch(() => false)) {
    await exhibitorAgreement.click({ force: true });
    await expect(page.getByRole('button', { name: /^Next/ })).toBeEnabled();
  }
});

async function waitForDogSearch(page: Page, query: string) {
  await page.waitForResponse(
    response =>
      response.url().includes('/rest/v1/dogs') &&
      response.request().method() === 'GET' &&
      response.url().toLowerCase().includes(query),
    { timeout: 10000 }
  );
}
