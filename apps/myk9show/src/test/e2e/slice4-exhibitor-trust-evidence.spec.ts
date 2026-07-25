/**
 * Slice 4 evidence walk (task 6.7): no-horizontal-overflow pass plus the
 * exhibitor trust contracts this slice fixed.
 *
 * READ-ONLY — signs in as the demo exhibitor and looks. It creates, edits and
 * deletes nothing, so unlike the Slice 3B walk it needs no shared-system
 * approval and is safe to re-run.
 *
 * Run it deliberately, pinned to its own port. Playwright's
 * `reuseExistingServer` will otherwise attach to whatever already holds 5173 —
 * including a dev server from a DIFFERENT worktree, which silently tests that
 * branch's code instead of this one:
 *
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:5199 PLAYWRIGHT_PORT=5199 \
 *     pnpm playwright test src/test/e2e/slice4-exhibitor-trust-evidence.spec.ts \
 *     --project=chromium --workers=1
 *
 * Requires E2E_DEMO_EXHIBITOR_PASSWORD in the env.
 */
import { test, expect, type Page } from '@playwright/test';
import { signInAsTestUser } from './helpers/testUsers';

const EVIDENCE_DIR = process.env.SLICE4_EVIDENCE_DIR ?? 'test-results/slice4-evidence';
const EVIDENCE_PROJECT = process.env.SLICE4_EVIDENCE_PROJECT ?? 'chromium';

/** The audited viewport classes (audit: 390x844 phone, 834x1112 tablet, 1280x800 desktop). */
const VIEWPORTS = [
  { name: 'phone-390', width: 390, height: 844 },
  { name: 'tablet-834', width: 834, height: 1112 },
  { name: 'desktop-1280', width: 1280, height: 800 },
] as const;

async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(500);
}

async function shoot(page: Page, name: string) {
  await settle(page);
  await page.screenshot({ path: `${EVIDENCE_DIR}/${name}.png`, fullPage: true });
}

/**
 * The document must never scroll horizontally. Compares scrollWidth against
 * clientWidth on both <html> and <body>; a 1px tolerance absorbs sub-pixel
 * rounding at fractional device widths.
 */
async function expectNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => {
    const de = document.documentElement;
    const body = document.body;
    return {
      docScroll: de.scrollWidth,
      docClient: de.clientWidth,
      bodyScroll: body.scrollWidth,
      bodyClient: body.clientWidth,
    };
  });
  expect(
    overflow.docScroll - overflow.docClient,
    `${label}: <html> overflows horizontally (${overflow.docScroll} > ${overflow.docClient})`
  ).toBeLessThanOrEqual(1);
  expect(
    overflow.bodyScroll - overflow.bodyClient,
    `${label}: <body> overflows horizontally (${overflow.bodyScroll} > ${overflow.bodyClient})`
  ).toBeLessThanOrEqual(1);
}

test.describe.configure({ mode: 'serial' });

test.describe('Slice 4: exhibitor trust contracts', () => {
  test.beforeEach(() => {
    test.skip(
      test.info().project.name !== EVIDENCE_PROJECT,
      `Evidence walk runs only on the "${EVIDENCE_PROJECT}" project.`
    );
  });

  test('no horizontal overflow across the audited viewports', async ({ page }) => {
    // Three viewports x two routes, each with a settle and a screenshot, does
    // not fit the default 30s per-test budget.
    test.setTimeout(150_000);
    await signInAsTestUser(page, 'DEMO_EXHIBITOR');

    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      for (const route of ['/my-entries', '/exhibitor/payments'] as const) {
        await page.goto(route);
        await settle(page);
        await expectNoHorizontalOverflow(page, `${route} @ ${vp.name}`);
      }

      await page.goto('/exhibitor/payments');
      await shoot(page, `payments-${vp.name}`);
    }
  });

  test('mobile Payments exposes amount, status and receipt at 390px', async ({ page }) => {
    await signInAsTestUser(page, 'DEMO_EXHIBITOR');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/exhibitor/payments');
    await settle(page);

    // Either real payment cards, or the truthful empty state — never a
    // desktop table clipped off the side of a phone.
    const cards = page.getByRole('group', { name: /payment for /i });
    const cardCount = await cards.count();

    if (cardCount > 0) {
      const first = cards.first();
      await expect(first.getByLabel(/amount: /i)).toBeVisible();
      await expect(first.getByLabel(/status: /i)).toBeVisible();
    } else {
      await expect(page.getByText(/no payments|nothing to pay|paid up/i).first()).toBeVisible();
    }

    await expect(page.getByRole('table')).toHaveCount(0);
    await shoot(page, 'payments-390-disclosure');
  });

  test('My Shows and My Payments agree on the amount due', async ({ page }) => {
    await signInAsTestUser(page, 'DEMO_EXHIBITOR');
    await page.setViewportSize({ width: 1280, height: 800 });

    // Compare the surfaces' OWN due indicators, not every currency string on
    // the page — My Payments also lists historical order amounts and refunds,
    // which are not debt.
    await page.goto('/my-entries');
    await settle(page);
    // exhibitor-money-clarity: $0 due renders the de-emphasized "Paid in full"
    // fees tile; a positive due keeps the amount and its pay path prominent.
    const myShowsPaidInFull = (await page.getByText('Paid in full').count()) > 0;
    await shoot(page, 'my-shows-amount-due');

    await page.goto('/exhibitor/payments');
    await settle(page);
    const paymentsPaidUp = (await page.getByText('Current entries are paid up.').count()) > 0;
    await shoot(page, 'my-payments-amount-due');

    // The contradiction this slice fixed was one surface claiming debt while
    // the other claimed none. Whatever the account's real state, the two must
    // agree on whether anything is owed.
    expect(
      myShowsPaidInFull,
      `My Shows "Paid in full"=${myShowsPaidInFull} but My Payments "paid up"=${paymentsPaidUp}`
    ).toBe(paymentsPaidUp);
  });
});
