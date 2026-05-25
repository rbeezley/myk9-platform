import { expect, test } from '@playwright/test';

const SECRETARY_EMAIL = 'secretary@myk9t.com';
const SECRETARY_PASS = 'TestPass4567!';
const TEST_SHOW_ID = '4ad95cdc-2c04-4386-8e0b-07b9111fcac3';

async function signInAsSecretary(page: import('@playwright/test').Page) {
  await page.goto('/sign-in');
  await page.waitForSelector('input[type="email"]');
  await page.locator('input[type="email"]').first().fill(SECRETARY_EMAIL);
  await page.locator('input[type="password"]').first().fill(SECRETARY_PASS);
  await Promise.all([
    page.waitForURL(url => !url.href.includes('/sign-in'), { timeout: 15000 }),
    page.locator('button[type="submit"]').first().click(),
  ]);
  await page.waitForLoadState('networkidle');
}

test.describe('Secretary Entry Walk', () => {
  test('full wizard walk: search dog → select → pick class → submit', async ({ page }) => {
    const errors: string[] = [];
    const responseErrors: string[] = [];
    const knownFindingResponses: string[] = [];
    const knownFindingConsoleErrors: string[] = [];
    let genericResource500Count = 0;
    page.on('console', msg => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (text === 'Failed to load resource: the server responded with a status of 500 ()') {
        genericResource500Count += 1;
        return;
      }
      if (
        text.includes('Failed to load users') ||
        text.includes('Store operation failed {operation: loadUsers') ||
        text.includes('Database query failed')
      ) {
        knownFindingConsoleErrors.push(text);
        return;
      }
      errors.push(`[${msg.type()}] ${text}`);
    });
    page.on('response', response => {
      const url = response.url();
      if (response.status() >= 400 && url.includes('/rest/v1/')) {
        const message = `${response.status()} ${url}`;
        // Open findings QA-NETWORK-ERROR-010/011 track these background Supabase
        // timeouts. Keep this spec focused on the secretary entry wizard submit path.
        if (url.includes('/rest/v1/people?') || url.includes('/rest/v1/enrollments?select=*')) {
          knownFindingResponses.push(message);
        } else {
          responseErrors.push(message);
        }
      }
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

    await signInAsSecretary(page);
    await page.goto(`/secretary/register/${TEST_SHOW_ID}`);
    await page.waitForSelector('text=Select Dogs', { timeout: 10000 });

    // ── Step 1: Find and select a dog ──────────────────────────────────────
    const searchInput = page
      .locator(
        'input[placeholder*="Search"], input[placeholder*="name"], input[placeholder*="breed"]'
      )
      .first();
    // Search for Ace — AKC-registered, born 2022-03-15, owned by Test Secretary
    await searchInput.fill('Ace');
    // Dismiss autocomplete dropdown with Escape, then wait for table to render
    await page.keyboard.press('Escape');
    await expect(page.getByText(/1 dog/i)).toBeVisible({ timeout: 5000 });

    // Table has header checkbox (index 0) + one per dog row.
    // Click index 1 to select the first eligible dog row (Ace).
    const checkboxes = page.locator('[role="checkbox"]');
    const count = await checkboxes.count();
    expect(count).toBeGreaterThanOrEqual(2);

    const dogCheckbox = checkboxes.nth(1); // index 0 = select-all header, index 1 = first dog row
    await dogCheckbox.click();
    await expect(dogCheckbox).toHaveAttribute('aria-checked', 'true');

    // Click Next
    const nextBtn = page.getByRole('button', { name: /next/i });
    await expect(nextBtn).toBeEnabled();

    // ── Step 2: Classes ────────────────────────────────────────────────────
    await nextBtn.click();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('text=Select Classes', { timeout: 8000 });

    // Find class options and select the first one
    const classCheckboxes = page.locator('[role="checkbox"]');
    const classCount = await classCheckboxes.count();
    expect(classCount).toBeGreaterThan(1);

    // The first class is seeded for Ace; choose the second class to avoid a
    // duplicate-entry 409 while still exercising the real secretary flow.
    const secondClass = classCheckboxes.nth(1);
    await secondClass.click();
    await expect(secondClass).toHaveAttribute('aria-checked', 'true');

    // Click Next to step 3 (Handlers)
    const nextBtn2 = page.getByRole('button', { name: /next/i });
    await expect(nextBtn2).toBeEnabled();
    await nextBtn2.click();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('text=Handlers', { timeout: 8000 });

    // ── Step 4: Payment ────────────────────────────────────────────────────
    const nextBtn3 = page.getByRole('button', { name: /next/i });
    await expect(nextBtn3).toBeEnabled();
    await nextBtn3.click();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('text=Payment Information', { timeout: 8000 });

    // Prefer secretary-received payment so clicking Next submits the entry
    // immediately instead of waiting for an online payment handoff.
    const secretaryPaymentBtn = page.getByRole('button', {
      name: /Secretary Payment \(Already Received\)/i,
    });
    const paymentOptionBtn = page
      .locator('button')
      .filter({ hasText: /credit.*card|check|cash|online payment/i })
      .first();
    if (await secretaryPaymentBtn.isVisible().catch(() => false)) {
      await secretaryPaymentBtn.click();
    } else if (await paymentOptionBtn.isVisible().catch(() => false)) {
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

    await expect(page.getByRole('heading', { name: 'Your entry is received.' })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/^(Receipt|Fees received)\b/i)).toBeVisible();
    expect(responseErrors).toEqual([]);
    expect(errors).toEqual([]);
    if (knownFindingConsoleErrors.length > 0) {
      expect(knownFindingResponses.length).toBeGreaterThan(0);
    }
    expect(genericResource500Count).toBeLessThanOrEqual(knownFindingResponses.length);
  });
});
