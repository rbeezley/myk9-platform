import { expect, test } from '@playwright/test';

const SECRETARY_EMAIL = 'secretary@myk9t.com';
const SECRETARY_PASS = 'TestPass4567!';
const TEST_SHOW_ID = '4584f257-19b5-4016-aae6-5e7827b769cb';
const DOG_SEARCH = 'Bravo';

async function signInAsSecretary(page: import('@playwright/test').Page) {
  await page.goto('/sign-in');
  await page.getByTestId('credential-input').fill(SECRETARY_EMAIL);
  await page.getByTestId('continue-button').click();
  await expect(page.getByTestId('password-input')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('password-input').fill(SECRETARY_PASS);
  await Promise.all([
    page.waitForURL(url => !url.href.includes('/sign-in'), { timeout: 15000 }),
    page.getByTestId('sign-in-button').click(),
  ]);
  await page.waitForLoadState('domcontentloaded');
}

test.describe('Secretary Entry Walk', () => {
  test('full wizard walk: search dog → select → pick class → submit', async ({ page }) => {
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

    await signInAsSecretary(page);
    await page.goto(`/secretary/register/${TEST_SHOW_ID}`);
    await page.waitForSelector('text=Select Dogs', { timeout: 10000 });

    // ── Step 1: Find and select a dog ──────────────────────────────────────
    const searchInput = page
      .locator(
        'input[placeholder*="Search"], input[placeholder*="name"], input[placeholder*="breed"]'
      )
      .first();
    await searchInput.fill(DOG_SEARCH);
    // Dismiss autocomplete dropdown with Escape, then wait for table to render
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
    await page.waitForSelector('text=Select Classes', { timeout: 8000 });

    const interiorCard = page.locator('.myk9-element-card').filter({ hasText: 'Interior' }).first();
    await expect(interiorCard).toBeVisible({ timeout: 10000 });
    const noviceA = interiorCard.locator('label.myk9-level-chip').filter({ hasText: 'Novice A' });
    await noviceA.click();
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

    // Payment options are <button> elements (not role=radio). Click the first one
    // if present; $0 entries only require the agreement to continue.
    const paymentOptionBtn = page
      .locator('button')
      .filter({ hasText: /credit.*card|check|cash|online payment/i })
      .first();
    if (await paymentOptionBtn.isVisible().catch(() => false)) {
      await paymentOptionBtn.click();
    }
    // Scroll down to find the entry agreement checkbox (below the fold)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    // #entry-agreement is aria-hidden (hidden native input for Base UI Checkbox).
    // Click the label instead — it toggles the checkbox via htmlFor association.
    const agreementLabel = page.locator('label[for="entry-agreement"]');
    await expect(agreementLabel).toBeVisible({ timeout: 5000 });
    await agreementLabel.click();

    // ── Step 5: Confirmation ───────────────────────────────────────────────
    const nextBtn4 = page.getByRole('button', { name: /next/i });
    await expect(nextBtn4).toBeEnabled();
    await nextBtn4.click();

    await expect(page.getByRole('heading', { name: 'Your entry is ready.' })).toBeVisible({
      timeout: 10000,
    });

    await page.getByRole('button', { name: 'Complete Registration' }).click();
    await expect(page).toHaveURL(new RegExp(`/shows/${TEST_SHOW_ID}`));
    await expect(page.getByRole('heading', { level: 2, name: 'June 2026' })).toBeVisible();
    expect(errors).toHaveLength(0);
  });
});
