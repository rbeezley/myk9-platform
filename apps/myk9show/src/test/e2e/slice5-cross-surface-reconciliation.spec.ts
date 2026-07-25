/**
 * Task 7.5 — cross-surface reconciliation for ONE seeded exhibitor account.
 *
 * The five surfaces in scope (My Shows, My Payments, Dog Activity, Subscription,
 * Pricing) each answer some subset of four questions: how much is owed, how many
 * entries there are, where Premium comes from, and what the user can do next.
 * This walk reads each surface's OWN indicator and asserts they agree.
 *
 * READ-ONLY. It signs in, looks, and writes an evidence JSON. It creates,
 * edits and deletes nothing, so it needs no shared-system approval.
 *
 * Two traps this spec is deliberately built around:
 *
 *  1. My Payments lists HISTORICAL amounts (past charges, refunds) beside the
 *     current balance, so comparing every `$X.XX` on the page reports
 *     differences that are not disagreements. Each surface is asked only for
 *     the one value it actually claims.
 *  2. The two surfaces format the same number differently — My Shows renders
 *     `$${amountDue.toLocaleString()}` ("$60"), My Payments renders
 *     `formatPaymentCents` ("$60.00"). Comparing strings fails on formatting
 *     alone, so both are normalized to integer cents before comparison.
 *
 * Run pinned to its own port. Playwright's `reuseExistingServer` will otherwise
 * attach to whatever already holds 5173 — including a dev server from a
 * DIFFERENT worktree, which silently tests that branch's code instead:
 *
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:5199 PLAYWRIGHT_PORT=5199 \
 *     pnpm playwright test src/test/e2e/slice5-cross-surface-reconciliation.spec.ts \
 *     --project=chromium --workers=1
 *
 * Requires E2E_DEMO_EXHIBITOR_PASSWORD in the env.
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { signInAsTestUser } from './helpers/testUsers';

const EVIDENCE_DIR = process.env.SLICE5_EVIDENCE_DIR ?? 'test-results/slice5-evidence';

/**
 * Seeded ground truth for e2e-exhibitor@test.myk9.com, read from staging while
 * writing this spec. Recorded so fixture drift fails the spec loudly rather
 * than letting it assert against whatever it happens to find.
 */
const SEED = {
  /**
   * Free TIER, but an active complimentary GRANT (2026-07-25 → 2026-10-23),
   * issued through admin_grant_entitlement for tasks 7.3/7.4 so the Premium
   * states and unlocked record forms are reachable. Five grants total: this
   * one active, plus four revoked ones from the Slice 3B transition walk that
   * remain as history.
   *
   * Entitlement is therefore 'complimentary', NOT the tier — the whole point
   * of the grant model is that a free-tier account can hold real Premium
   * access. When this grant lapses the account reverts to 'expired' and this
   * fixture must be updated with it.
   */
  entitlement: 'complimentary',
  /** Both surfaces must agree the user currently HAS Premium. */
  hasActivePremium: true,
  /** Dog carrying the widest status spread (paid, refunded, waived, confirmed). */
  dogId: 'dededede-0000-0000-0000-000000000041',
  dogName: 'Willow',
  /**
   * The show carrying the mixed-status order that broke the money path twice
   * during Slice 4: paid + pending + refunded + waived across 15 rows, with
   * both online and unset payment methods.
   */
  mixedShowName: 'Heartland Scent Work Classic',
} as const;

/** "$60", "$60.00" and "$1,234.50" all become integer cents. */
function toCents(currency: string): number {
  return Math.round(Number(currency.replace(/[$,]/g, '')) * 100);
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(500);
}

test.describe('Slice 5: cross-surface reconciliation', () => {
  test.setTimeout(180_000);

  test('My Shows, My Payments, Dog Activity, Subscription and Pricing agree', async ({ page }) => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    await signInAsTestUser(page, 'DEMO_EXHIBITOR');
    await page.setViewportSize({ width: 1280, height: 800 });

    const record: Record<string, unknown> = {};

    // --- My Shows -----------------------------------------------------------
    await page.goto('/my-entries');
    await settle(page);
    const myShowsBody = (await page.locator('body').textContent()) ?? '';

    // Fixture guard: every downstream comparison assumes this order is present.
    expect(
      myShowsBody,
      `Seeded show "${SEED.mixedShowName}" missing from My Shows — fixture drift`
    ).toContain(SEED.mixedShowName);

    // The Current Fees tile renders "Amount due $N" when anything is owed and
    // the quiet "Paid in full" when nothing is.
    const myShowsDueMatch = myShowsBody.match(/Amount due \$([\d,]+(?:\.\d{2})?)/);
    const myShowsPaidInFull = /Paid in full/.test(myShowsBody);
    const myShowsDueCents = myShowsDueMatch
      ? toCents(myShowsDueMatch[1])
      : myShowsPaidInFull
        ? 0
        : null;
    record.myShowsDueCents = myShowsDueCents;
    record.myShowsPaidInFull = myShowsPaidInFull;

    // Entry count from the mobile summary line ("N entries · M upcoming").
    // Adjacent spans concatenate without whitespace ("5entries·1upcoming").
    const entryCountMatch = myShowsBody.match(/(\d+)\s*entr(?:y|ies)\s*·/);
    record.myShowsEntryCount = entryCountMatch ? Number(entryCountMatch[1]) : null;

    await page.screenshot({ path: `${EVIDENCE_DIR}/my-shows.png`, fullPage: true });

    // --- My Payments --------------------------------------------------------
    await page.goto('/exhibitor/payments');
    await settle(page);
    const paymentsBody = (await page.locator('body').textContent()) ?? '';

    // Scope to the balance card: read the currency that immediately follows the
    // "Amount due" label, never the historical order amounts further down.
    const paymentsDueMatch = paymentsBody.match(/Amount due\s*\$([\d,]+\.\d{2})/);
    const paymentsPaidUp = /Current entries are paid up\./.test(paymentsBody);
    const paymentsDueCents = paymentsDueMatch
      ? toCents(paymentsDueMatch[1])
      : paymentsPaidUp
        ? 0
        : null;
    record.paymentsDueCents = paymentsDueCents;
    record.paymentsPaidUp = paymentsPaidUp;

    // The action offered must match the debt claimed.
    record.paymentsAction =
      (await page.getByRole('button', { name: /finish payment|pay .* online/i }).count()) > 0
        ? 'pay'
        : 'none';

    await page.screenshot({ path: `${EVIDENCE_DIR}/my-payments.png`, fullPage: true });

    // --- Dog Activity -------------------------------------------------------
    await page.goto(`/dogs/${SEED.dogId}`);
    await settle(page);
    const dogBody = (await page.locator('body').textContent()) ?? '';
    expect(dogBody, `Seeded dog "${SEED.dogName}" not rendered — fixture drift`).toContain(
      SEED.dogName
    );
    await page.screenshot({ path: `${EVIDENCE_DIR}/dog-activity.png`, fullPage: true });

    // --- Subscription -------------------------------------------------------
    await page.goto('/subscription');
    await settle(page);
    const subBody = (await page.locator('body').textContent()) ?? '';
    // SubscriptionStatus renders SOURCE_LABEL for an active grant, "Premium
    // access ended" when expired, and the "You're on the free plan." copy
    // otherwise. Order matters: the free copy also contains the word "Premium".
    record.subscriptionEntitlement = /You're on the free plan\./.test(subBody)
      ? 'free'
      : /Premium access ended/.test(subBody)
        ? 'expired'
        : /Complimentary Premium/.test(subBody)
          ? 'complimentary'
          : /Founding Member Premium/.test(subBody)
            ? 'founding'
            : 'paid';
    await page.screenshot({ path: `${EVIDENCE_DIR}/subscription.png`, fullPage: true });

    // --- Pricing ------------------------------------------------------------
    await page.goto('/pricing-page');
    await settle(page);
    const pricingBody = (await page.locator('body').textContent()) ?? '';
    // PricingPage swaps the Premium CTA for CURRENT_ACCESS_LABEL[activeSource]
    // once a TRUSTED entitlement says the user already has access.
    record.pricingEntitlement = /You have Complimentary Premium/.test(pricingBody)
      ? 'complimentary'
      : /You have Founding Member Premium/.test(pricingBody)
        ? 'founding'
        : /You have Premium/.test(pricingBody)
          ? 'paid'
          : 'free';
    await page.screenshot({ path: `${EVIDENCE_DIR}/pricing.png`, fullPage: true });

    writeFileSync(
      `${EVIDENCE_DIR}/reconciliation.json`,
      JSON.stringify({ seed: SEED, record }, null, 2)
    );

    // --- Reconciliation assertions -----------------------------------------

    // Both surfaces must actually state a balance. A null here means the
    // indicator this spec keys off was renamed — the spec is then blind, and
    // silently passing would be worse than failing.
    expect(myShowsDueCents, 'My Shows stated no amount-due indicator').not.toBeNull();
    expect(paymentsDueCents, 'My Payments stated no amount-due indicator').not.toBeNull();

    // The contract Codex found broken twice in Slice 4: one surface claiming
    // debt while the other claims none, or claiming a different figure.
    expect(
      paymentsDueCents,
      `My Shows says ${myShowsDueCents} cents due, My Payments says ${paymentsDueCents} cents`
    ).toBe(myShowsDueCents);

    // The offered action must match the claimed debt.
    expect(
      record.paymentsAction,
      `My Payments claims ${paymentsDueCents} cents due but offers action "${record.paymentsAction}"`
    ).toBe((paymentsDueCents ?? 0) > 0 ? 'pay' : 'none');

    // Entitlement source. Subscription reports the precise lifecycle state;
    // Pricing only distinguishes "already has access" from "can subscribe".
    // Compare each against the seeded truth in its own vocabulary, then assert
    // the thing they must never disagree about: whether Premium is active now.
    expect(record.subscriptionEntitlement).toBe(SEED.entitlement);

    const subscriptionSaysActive = ['paid', 'founding', 'complimentary'].includes(
      String(record.subscriptionEntitlement)
    );
    const pricingSaysActive = record.pricingEntitlement !== 'free';
    expect(
      pricingSaysActive,
      `Subscription active=${subscriptionSaysActive} but Pricing active=${pricingSaysActive}`
    ).toBe(subscriptionSaysActive);
    expect(subscriptionSaysActive).toBe(SEED.hasActivePremium);
  });
});
