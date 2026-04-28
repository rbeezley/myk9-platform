import { test } from '@playwright/test';

const SECRETARY_EMAIL = 'secretary@myk9t.com';
const SECRETARY_PASS = 'testpass123';
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
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(`[${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', err =>
      errors.push(`[pageerror] ${err.message}: ${err.stack?.slice(0, 200)}`)
    );

    await signInAsSecretary(page);
    await page.goto(`/secretary/register/${TEST_SHOW_ID}`);
    await page.waitForSelector('text=Select Dogs', { timeout: 10000 });
    await page.screenshot({ path: '/tmp/w01-step1-load.png' });

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
    await page.waitForTimeout(800);
    await page.screenshot({ path: '/tmp/w02-step1-searched.png' });

    // Table has header checkbox (index 0) + one per dog row.
    // Click index 1 to select the first eligible dog row (Ace).
    const checkboxes = page.locator('[role="checkbox"]');
    const count = await checkboxes.count();
    console.log('Total checkboxes visible:', count);

    if (count < 2) {
      const body = await page.locator('body').textContent();
      console.log(
        'BLOCKER step 1 — expected >=2 checkboxes (header+row). Body:',
        body?.replace(/\s+/g, ' ').slice(0, 500)
      );
      await page.screenshot({ path: '/tmp/w-blocker-step1.png' });
      return;
    }

    const dogCheckbox = checkboxes.nth(1); // index 0 = select-all header, index 1 = first dog row
    await dogCheckbox.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/tmp/w03-step1-selected.png' });

    const isChecked = await dogCheckbox.getAttribute('aria-checked');
    console.log('Dog selected (aria-checked):', isChecked);

    // Click Next
    const nextBtn = page.getByRole('button', { name: /next/i });
    const nextEnabled = await nextBtn.isEnabled().catch(() => false);
    console.log('Next enabled:', nextEnabled);

    if (!nextEnabled) {
      console.log('BLOCKER: Next button disabled after selecting dog');
      await page.screenshot({ path: '/tmp/w-blocker-next.png' });
      return;
    }

    // ── Step 2: Classes ────────────────────────────────────────────────────
    await nextBtn.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/tmp/w04-step2-classes.png' });
    const step2Body = await page.locator('body').textContent();
    console.log('Step 2:', step2Body?.replace(/\s+/g, ' ').slice(0, 400));

    // Find class options and select the first one
    const classCheckboxes = page.locator('[role="checkbox"]');
    const classCount = await classCheckboxes.count();
    console.log('Class checkboxes count:', classCount);

    if (classCount > 0) {
      await classCheckboxes.first().click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: '/tmp/w05-step2-class-selected.png' });
    } else {
      console.log('BLOCKER: no class checkboxes found in Step 2');
      return;
    }

    // Click Next to step 3 (Handlers)
    const nextBtn2 = page.getByRole('button', { name: /next/i });
    if (!(await nextBtn2.isEnabled().catch(() => false))) {
      console.log('BLOCKER: Next disabled after selecting class');
      return;
    }
    await nextBtn2.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/tmp/w06-step3-handlers.png' });
    const step3Body = await page.locator('body').textContent();
    console.log('Step 3:', step3Body?.replace(/\s+/g, ' ').slice(0, 300));

    // ── Step 4: Payment ────────────────────────────────────────────────────
    const nextBtn3 = page.getByRole('button', { name: /next/i });
    if (!(await nextBtn3.isEnabled().catch(() => false))) {
      console.log('BLOCKER: Next disabled on Step 3');
      return;
    }
    await nextBtn3.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/tmp/w07-step4-payment.png' });
    const step4Body = await page.locator('body').textContent();
    console.log('Step 4 (Payment):', step4Body?.replace(/\s+/g, ' ').slice(0, 500));

    // BUG: payment method required even when Total Due = $0.00.
    // Payment options are <button> elements (not role=radio). Click the first one.
    const paymentOptionBtn = page
      .locator('button')
      .filter({ hasText: /credit.*card|check|cash|online payment/i })
      .first();
    if (await paymentOptionBtn.isVisible().catch(() => false)) {
      await paymentOptionBtn.click();
      await page.waitForTimeout(300);
      console.log('Selected payment method button');
    } else {
      console.log('Payment option button not visible — trying any button in payment section');
    }
    // Scroll down to find the entry agreement checkbox (below the fold)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/tmp/w07b-step4-payment-selected.png' });

    // #entry-agreement is aria-hidden (hidden native input for Base UI Checkbox).
    // Click the label instead — it toggles the checkbox via htmlFor association.
    const agreementLabel = page.locator('label[for="entry-agreement"]');
    const labelVisible = await agreementLabel.isVisible().catch(() => false);
    console.log('Agreement label visible:', labelVisible);
    if (labelVisible) {
      await agreementLabel.click();
      await page.waitForTimeout(300);
      console.log('Clicked agreement label');
    } else {
      // Fallback: click by text
      const fallbackLabel = page.getByText(/read and agree/i);
      if (await fallbackLabel.isVisible().catch(() => false)) {
        await fallbackLabel.click();
        console.log('Clicked agreement label via text');
      } else {
        console.log('BLOCKER: Agreement label not found');
      }
    }
    await page.screenshot({ path: '/tmp/w07c-step4-agreed.png' });

    // ── Step 5: Confirmation ───────────────────────────────────────────────
    const nextBtn4 = page.getByRole('button', { name: /next/i });
    if (!(await nextBtn4.isEnabled().catch(() => false))) {
      console.log('BLOCKER: Next disabled on Step 4 (Payment) even after agreement');
      // Still capture state
      return;
    }
    // Intercept the submit-entries RPC before clicking
    const rpcPromise = page
      .waitForResponse(r => r.url().includes('submit_show_entries') || r.url().includes('rpc'), {
        timeout: 10000,
      })
      .catch(() => null);

    await nextBtn4.click();
    const rpcResp = await rpcPromise;
    if (rpcResp) {
      console.log('RPC status:', rpcResp.status());
      const rpcBody = await rpcResp.json().catch(() => null);
      console.log('RPC body:', JSON.stringify(rpcBody).slice(0, 300));
    } else {
      console.log('No RPC call intercepted');
    }

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    console.log('URL after Next click:', page.url());
    await page.screenshot({ path: '/tmp/w08-step5-confirm.png' });
    const step5Body = await page.locator('body').textContent();
    console.log('Step 5 (Confirmation):', step5Body?.replace(/\s+/g, ' ').slice(0, 600));

    // Look for Submit button
    const submitBtn = page.getByRole('button', { name: /submit|confirm|complete/i });
    const submitVisible = await submitBtn.isVisible().catch(() => false);
    console.log('Submit button visible:', submitVisible);
    if (submitVisible) {
      const submitEnabled = await submitBtn.isEnabled().catch(() => false);
      console.log('Submit button enabled:', submitEnabled);
    }

    console.log('Console errors:', errors);
  });
});
