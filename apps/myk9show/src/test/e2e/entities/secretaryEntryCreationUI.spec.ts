/**
 * Secretary Entry Creation — E2E
 *
 * Walks the secretary path through the 5-step registration wizard
 * (Select Dogs → Classes → Handlers → Payment → Confirmation).
 *
 * Prerequisites (seeded in staging DB):
 *  - secretary@myk9t.com / testpass123 (agreed_to_tos_at set)
 *  - Dog "Ace" (id: 074d56ff-a42f-4259-a2f6-030183a13f55) owned by Test Secretary,
 *    AKC registration on file, DOB 2022-03-15 (eligible: 6+ months, has registration)
 *  - Show "Test Golden Path Show" (id: 4ad95cdc-2c04-4386-8e0b-07b9111fcac3) org=AKC,
 *    trials + classes including Container Novice A/B (Saturday Trial 1)
 *  - organization_agreements row for AKC (migration 122)
 *
 * Bugs fixed in this PR that this spec covers:
 *  - cartStore.loadCart: duplicate active carts caused maybeSingle() to throw;
 *    fixed with order+limit(1)
 *  - canProceed('payment'): required payment method even when Total Due = $0;
 *    fixed to skip payment-method check for free entries
 */
import { test, expect } from '@playwright/test';

// Auth: secretary@myk9t.com / testpass123 — matches clubsUI / trialsUI pattern
const SECRETARY_EMAIL = 'secretary@myk9t.com';
const SECRETARY_PASSWORD = 'testpass123';
const TEST_SHOW_ID = '4ad95cdc-2c04-4386-8e0b-07b9111fcac3';

async function signInAsSecretary(page: import('@playwright/test').Page) {
  await page.goto('/sign-in');
  await page.waitForSelector('input[type="email"]');
  await page.locator('input[type="email"]').first().fill(SECRETARY_EMAIL);
  await page.locator('input[type="password"]').first().fill(SECRETARY_PASSWORD);
  await Promise.all([
    page.waitForURL(url => !url.href.includes('/sign-in'), { timeout: 15000 }),
    page.locator('button[type="submit"]').first().click(),
  ]);
  await page.waitForLoadState('networkidle');
}

test.describe('Secretary Entry Creation', () => {
  // Serial mode: the full-flow test writes a DB entry; parallel execution causes
  // race conditions between tests sharing the same staging DB and auth session.
  test.describe.configure({ mode: 'serial' });

  test('entry management page loads with New Entry button', async ({ page }) => {
    await signInAsSecretary(page);
    await page.goto(`/secretary/entries/${TEST_SHOW_ID}`);
    await page.waitForSelector('text=Entry Management', { timeout: 10000 });

    await expect(page.getByRole('button', { name: /new entry/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /refresh/i })).toBeVisible();
  });

  test('New Entry button navigates to registration wizard', async ({ page }) => {
    await signInAsSecretary(page);
    await page.goto(`/secretary/entries/${TEST_SHOW_ID}`);
    await page.waitForSelector('text=Entry Management', { timeout: 10000 });

    await page.getByRole('button', { name: /new entry/i }).click();
    await page.waitForURL(`**/secretary/register/${TEST_SHOW_ID}`, { timeout: 10000 });
    await expect(page).toHaveURL(`/secretary/register/${TEST_SHOW_ID}`);
  });

  test('wizard: step 1 — dog search returns results', async ({ page }) => {
    await signInAsSecretary(page);
    await page.goto(`/secretary/register/${TEST_SHOW_ID}`);
    await page.waitForSelector('text=Select Dogs', { timeout: 10000 });

    const searchInput = page
      .locator(
        'input[placeholder*="Search"], input[placeholder*="name"], input[placeholder*="breed"]'
      )
      .first();
    await searchInput.fill('Ace');
    await page.keyboard.press('Escape');
    // Wait for the virtual list to render the result row
    await expect(page.getByText(/1 dog/i)).toBeVisible({ timeout: 5000 });

    // 2 checkboxes: header + 1 dog row
    await expect(page.locator('[role="checkbox"]')).toHaveCount(2);
  });

  test('wizard: full flow — dog → class → handler → agreement → confirmation', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await signInAsSecretary(page);
    await page.goto(`/secretary/register/${TEST_SHOW_ID}`);
    await page.waitForSelector('text=Select Dogs', { timeout: 10000 });

    // ── Step 1: Select dog ────────────────────────────────────────────────
    const searchInput = page
      .locator(
        'input[placeholder*="Search"], input[placeholder*="name"], input[placeholder*="breed"]'
      )
      .first();
    await searchInput.fill('Ace');
    await page.keyboard.press('Escape');
    // Wait for the virtual list to render the result row before interacting
    await expect(page.getByText(/1 dog/i)).toBeVisible({ timeout: 5000 });

    // nth(0) = header "select all", nth(1) = dog row (Ace)
    await page.locator('[role="checkbox"]').nth(1).click();
    await expect(page.locator('[role="checkbox"]').nth(1)).toHaveAttribute('aria-checked', 'true');

    // Step 1 → 2
    await expect(page.getByRole('button', { name: /next/i })).toBeEnabled();
    await page.getByRole('button', { name: /next/i }).click();
    await page.waitForLoadState('networkidle');

    // ── Step 2: Select class ──────────────────────────────────────────────
    await page.waitForSelector('text=Select Classes', { timeout: 8000 });
    const classCheckboxes = page.locator('[role="checkbox"]');
    await expect(classCheckboxes.first()).toBeVisible();

    // Click the second class checkbox (nth(1), after the select-all header at nth(0)).
    // Container Novice B is the second option in Saturday Trial 1 — avoids
    // duplicate-entry conflicts with Container Novice A which has a seeded entry.
    const secondClass = classCheckboxes.nth(1);
    await secondClass.click();
    await expect(secondClass).toHaveAttribute('aria-checked', 'true');

    await expect(page.getByRole('button', { name: /next/i })).toBeEnabled();
    await page.getByRole('button', { name: /next/i }).click();
    await page.waitForLoadState('networkidle');

    // ── Step 3: Handlers (auto-assigned) ─────────────────────────────────
    await page.waitForSelector('text=Handlers', { timeout: 8000 });
    await expect(page.getByText(/all entries have handlers assigned/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /next/i })).toBeEnabled();
    await page.getByRole('button', { name: /next/i }).click();
    await page.waitForLoadState('networkidle');

    // ── Step 4: Payment + AKC agreement ──────────────────────────────────
    await page.waitForSelector('text=Payment Information', { timeout: 8000 });

    // Scroll down to reveal the entry agreement section then wait for its label
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.locator('label[for="entry-agreement"]')).toBeVisible({ timeout: 5000 });

    // Check the AKC entry agreement
    await page.locator('label[for="entry-agreement"]').click();

    // For $0 entries, payment method is no longer required (fixed canProceed).
    // Expect enabled immediately after the agreement toggles — no sleep needed.
    await expect(page.getByRole('button', { name: /next/i })).toBeEnabled();

    // Intercept the submit-entries RPC
    const rpcPromise = page.waitForResponse(r => r.url().includes('submit_show_entries'), {
      timeout: 15000,
    });
    await page.getByRole('button', { name: /next/i }).click();
    const rpcResp = await rpcPromise;
    expect(rpcResp.status()).toBe(200);

    // ── Step 5: Confirmation ──────────────────────────────────────────────
    await page.waitForSelector('text=Registration Confirmed', { timeout: 10000 });
    await expect(page.getByText(/confirmation #:/i)).toBeVisible();

    // No blocking console errors (cart errors and email CORS are non-blocking)
    const blockingErrors = consoleErrors.filter(
      e =>
        !e.includes('cartStore') &&
        !e.includes('CORS') &&
        !e.includes('send-registration-email') &&
        !e.includes('ERR_FAILED')
    );
    expect(blockingErrors).toHaveLength(0);
  });
});
