import { expect, test } from '@playwright/test';
import { signInAsSecretary } from './uat/shared/auth';
import { LIVE_SECRETARY_SHOW_ID, LIVE_SECRETARY_SHOW_NAME } from './uat/shared/seededShows';

const TEST_SHOW_ID = LIVE_SECRETARY_SHOW_ID;
const DOG_SEARCH = 'Ranger';
const MOCK_CART_ID = '00000000-0000-4000-8000-00000000c001';

test.describe('Secretary Entry Walk', () => {
  test('full wizard walk: search dog → select → pick class → submit', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-05-15T12:00:00.000Z'));

    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(`[${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', err =>
      errors.push(`[pageerror] ${err.message}: ${err.stack?.slice(0, 200)}`)
    );

    await page.route('**/functions/v1/send-registration-email', async route => {
      await route.fulfill({
        status: 200,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'POST, OPTIONS',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ ok: true }),
      });
    });

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
            show_id: TEST_SHOW_ID,
            exhibitor_id: 'secretary-entry-walk-exhibitor',
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
            id: 'secretary-entry-walk-cart-item',
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
          id: 'secretary-walk-registration',
          show_id: TEST_SHOW_ID,
          handler_id: 'secretary-walk-handler',
          confirmation_number: 'MK9-WALK001',
          payment_status: 'paid',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });
    });

    await page.route('**/rest/v1/rpc/submit_show_entries', async route => {
      const payload = route.request().postDataJSON() as {
        p_registration_id?: string;
        p_submission_id?: string;
        p_entries?: Array<{ dog_id: string }>;
      };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          entries: (payload.p_entries ?? []).map((entry, index) => ({
            entry_id: `secretary-walk-entry-${index + 1}`,
            dog_id: entry.dog_id,
          })),
          registration_id: payload.p_registration_id ?? 'secretary-walk-registration',
          submission_id: payload.p_submission_id ?? 'secretary-walk-submission',
        }),
      });
    });

    await page.route('**/rest/v1/rpc/assign_armband', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(9001),
      });
    });

    await page.route('**/rest/v1/entries**', async route => {
      const request = route.request();
      if (request.method() !== 'PATCH') return route.fallback();

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'secretary-walk-entry-1', armband: '9001' }]),
      });
    });

    await signInAsSecretary(page, `/secretary/register/${TEST_SHOW_ID}`);
    await page.goto(`/secretary/register/${TEST_SHOW_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Select Dogs to Register' })).toBeVisible({
      timeout: 15000,
    });

    // ── Step 1: Find and select a dog ──────────────────────────────────────
    const searchInput = page
      .locator(
        'input[placeholder*="Search"], input[placeholder*="name"], input[placeholder*="breed"]'
      )
      .first();
    await searchInput.fill(DOG_SEARCH);
    await waitForDogSearch(page, DOG_SEARCH.toLowerCase());
    // Dismiss autocomplete dropdown with Escape, then wait for table to render.
    await page.keyboard.press('Escape');
    await expect(page.getByText(/1 dog/i)).toBeVisible({ timeout: 5000 });

    const dogCheckbox = page.getByRole('checkbox', {
      name: new RegExp(`Select ${DOG_SEARCH}`, 'i'),
    });
    await dogCheckbox.click();
    await expect(dogCheckbox).toHaveAttribute('aria-checked', 'true');

    // Click Next
    const nextBtn = page.getByRole('button', { name: /next/i });
    await expect(nextBtn).toBeEnabled();

    // ── Step 2: Classes ────────────────────────────────────────────────────
    await nextBtn.click();
    await expect(page.getByRole('heading', { name: 'Select Classes' })).toBeVisible({
      timeout: 8000,
    });

    const containerCard = page
      .locator('.myk9-element-card')
      .filter({ hasText: 'Container' })
      .first();
    await expect(containerCard).toBeVisible({ timeout: 10000 });
    await containerCard.getByRole('checkbox', { name: 'Select Novice A' }).first().click();
    await expect(page.getByText(/1 selected/).first()).toBeVisible();

    // Click Next to step 3 (Handlers)
    const nextBtn2 = page.getByRole('button', { name: /next/i });
    await expect(nextBtn2).toBeEnabled();
    await nextBtn2.click();
    await page.waitForSelector('text=Handlers', { timeout: 8000 });

    // ── Step 4: Payment ────────────────────────────────────────────────────
    const nextBtn3 = page.getByRole('button', { name: /next/i });
    await expect(nextBtn3).toBeEnabled();
    await nextBtn3.click();
    await page.waitForSelector('text=Payment Information', { timeout: 8000 });

    await page.getByRole('button', { name: /Secretary Payment \(Already Received\)/i }).click();
    // Scroll down to find the entry agreement checkbox (below the fold)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    // #entry-agreement is aria-hidden (hidden native input for Base UI Checkbox).
    // Click the label instead — it toggles the checkbox via htmlFor association.
    const agreementLabel = page.locator('label[for="entry-agreement"]');
    await expect(agreementLabel).toBeVisible({ timeout: 5000 });
    await agreementLabel.click();

    // ── Step 5: Confirmation ───────────────────────────────────────────────
    const submitEntry = page.getByRole('button', { name: /^Submit entry$/ });
    await expect(submitEntry).toBeEnabled();
    await submitEntry.click();

    await expect(page.getByRole('heading', { name: /^Entry submitted\./i })).toBeVisible({
      timeout: 10000,
    });

    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page).toHaveURL(new RegExp(`/shows/${TEST_SHOW_ID}`));
    await expect(
      page.getByRole('heading', { level: 2, name: LIVE_SECRETARY_SHOW_NAME })
    ).toBeVisible();
    expect(errors).toHaveLength(0);
  });
});

async function waitForDogSearch(page: import('@playwright/test').Page, query: string) {
  await page.waitForResponse(
    response =>
      response.url().includes('/rest/v1/dogs') &&
      response.request().method() === 'GET' &&
      response.url().toLowerCase().includes(query),
    { timeout: 10000 }
  );
}
