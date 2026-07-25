/**
 * Task 7.6 — automated accessibility pass plus keyboard-only walkthrough over
 * the exhibitor surfaces this change touched.
 *
 * READ-ONLY. Signs in, scans, and tabs. Submits nothing.
 *
 * Scope note: the Premium record forms (health, training, pedigree) are scanned
 * in the state a NON-entitled exhibitor sees them — behind their BlurGate. The
 * seeded account has no active Premium, and granting one is a shared-system
 * write, so the unlocked forms are covered separately. The admin grant control
 * likewise needs an admin session. Both gaps are recorded rather than skipped.
 *
 * Run pinned to its own port — `reuseExistingServer` will otherwise attach to
 * another worktree's dev server on 5173 and scan that branch's markup:
 *
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:5199 PLAYWRIGHT_PORT=5199 \
 *     pnpm playwright test src/test/e2e/slice5-a11y-keyboard.spec.ts \
 *     --project=chromium --workers=1
 *
 * Requires E2E_DEMO_EXHIBITOR_PASSWORD in the env.
 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signInAsTestUser } from './helpers/testUsers';

/** Serious and critical block; moderate and minor are logged as advisory. */
const BLOCKING_IMPACTS = ['serious', 'critical'];

const SEED_DOG_ID = 'dededede-0000-0000-0000-000000000041';
/** The demo exhibitor's person row — the grant control's subject. */
const SEED_PERSON_ID = '6fd402f4-88fb-447d-876e-7c6ae3c429d1';

/** Surfaces in 7.6's scope that a non-entitled exhibitor can reach. */
const SURFACES = [
  { name: 'Dog Details', path: `/dogs/${SEED_DOG_ID}` },
  { name: 'My Payments', path: '/exhibitor/payments' },
  { name: 'Subscription', path: '/subscription' },
  { name: 'Pricing', path: '/pricing-page' },
] as const;

async function waitForAppShell(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#root').waitFor({ state: 'attached', timeout: 20000 });
  await expect(page.locator('#root')).not.toBeEmpty({ timeout: 20000 });
  await expect(page.getByText('Loading page...')).toHaveCount(0, { timeout: 20000 });
  // axe composites semi-transparent text against its backdrop, so scanning
  // mid-fade reports artificially low contrast for fully-AA colors.
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForTimeout(1500);
}

async function assertNoBlockingViolations(page: Page, name: string, include?: string) {
  const builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  if (include) builder.include(include);
  const results = await builder.analyze();

  const blocking = results.violations.filter(v => BLOCKING_IMPACTS.includes(v.impact ?? ''));
  const advisory = results.violations.filter(v => !BLOCKING_IMPACTS.includes(v.impact ?? ''));

  if (advisory.length > 0) {
    console.log(
      `[a11y][${name}] ${advisory.length} moderate/minor (non-blocking): ` +
        advisory.map(v => `${v.id}(${v.impact})`).join(', ')
    );
  }

  if (blocking.length > 0) {
    const detail = blocking
      .map(v => {
        const nodes = v.nodes
          .map(
            n =>
              `      • ${n.target.join(' ')}\n        ${(n.failureSummary ?? '').replace(/\n/g, '\n        ')}`
          )
          .join('\n');
        return `  - ${v.id} (${v.impact}): ${v.help} [${v.nodes.length} node(s)]\n    ${v.helpUrl}\n${nodes}`;
      })
      .join('\n');
    throw new Error(
      `${name} has ${blocking.length} serious/critical a11y violation(s):\n${detail}`
    );
  }
}

test.describe('Slice 5: accessibility', () => {
  test.setTimeout(180_000);

  for (const surface of SURFACES) {
    test(`${surface.name} has no serious/critical violations`, async ({ page }) => {
      await signInAsTestUser(page, 'DEMO_EXHIBITOR');
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(surface.path);
      await waitForAppShell(page);
      await assertNoBlockingViolations(page, surface.name);
    });
  }

  /**
   * The 390px "disclosure" is a container-width layout switch driven by
   * `useElementWidth`, not an expand/collapse control — the narrow layout
   * surfaces amount, status and receipt inline instead of hiding them behind a
   * toggle (see ExhibitorPaymentsPage.mobile.test.tsx). There is nothing to
   * open, so scan the page exactly as a phone renders it.
   *
   * An earlier version of this test clicked every `[aria-expanded="false"]` on
   * the page to "expand the disclosure". That opened the nav popups instead,
   * whose Base UI focus guards sit inside the `aria-hidden` backdrop and trip
   * axe's `aria-hidden-focus` rule — a finding about the test, not the page.
   */
  test('My Payments is accessible in the 390px layout', async ({ page }) => {
    await signInAsTestUser(page, 'DEMO_EXHIBITOR');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/exhibitor/payments');
    await waitForAppShell(page);

    await assertNoBlockingViolations(page, 'My Payments (390px)');
  });

  /**
   * The admin grant control (ComplimentaryPremiumSection) renders inside
   * UserEditPanel, behind `admin:manage`, reached from /people/:id. Opened and
   * scanned only — no grant or revoke is submitted.
   */
  test('admin grant control has no serious/critical violations', async ({ page }) => {
    await signInAsTestUser(page, 'SITE_ADMIN');
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/people/${SEED_PERSON_ID}`);
    await waitForAppShell(page);

    await page.getByRole('button', { name: /^edit/i }).first().click();

    // Wait for the grant form's OWN control, not just its heading. The heading
    // renders before the section's inputs mount, and scanning that window
    // yields a nondeterministic pass — axe finds nothing because the controls
    // it would flag do not exist yet.
    await expect(
      page.getByPlaceholder(/Why is this user receiving complimentary Premium\?/i)
    ).toBeVisible({ timeout: 20000 });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.waitForTimeout(1000);

    // Scoped to the grant control itself. The surrounding UserEditPanel carries
    // pre-existing debt unrelated to this change — 7 unnamed Base UI buttons
    // and the hardcoded `bg-[#1a365d]` registry badge in registrationUtils.ts —
    // which is tracked as its own follow-up rather than silently widening this
    // change's scope.
    await assertNoBlockingViolations(
      page,
      'Admin grant control',
      '[data-testid="complimentary-premium-section"]'
    );
  });
});

test.describe('Slice 5: keyboard-only walkthrough', () => {
  test.setTimeout(180_000);

  for (const surface of SURFACES) {
    test(`${surface.name} is reachable and focus stays visible by keyboard`, async ({ page }) => {
      await signInAsTestUser(page, 'DEMO_EXHIBITOR');
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(surface.path);
      await waitForAppShell(page);

      const seen = new Set<string>();
      let cycled = false;

      // Walk a bounded number of stops. Every stop must land on a real
      // interactive element that carries a visible focus indicator.
      for (let i = 0; i < 40; i += 1) {
        await page.keyboard.press('Tab');
        const info = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return null;
          const style = window.getComputedStyle(el);
          return {
            tag: el.tagName.toLowerCase(),
            // Identity must NOT include the tab index, or every stop looks
            // unique and the revisit check below can never fire.
            key: `${el.tagName}:${el.getAttribute('aria-label') ?? el.textContent?.slice(0, 24) ?? ''}`,
            outline: style.outlineStyle,
            outlineWidth: style.outlineWidth,
            boxShadow: style.boxShadow,
            disabled: (el as HTMLButtonElement).disabled === true,
          };
        });

        if (!info) continue;
        // Revisiting a stop means tab order wrapped — that is normal, and the
        // point at which the cycle is fully enumerated. Stop walking.
        if (seen.has(info.key)) {
          cycled = true;
          break;
        }
        seen.add(info.key);

        // A focused control must be distinguishable. Base UI focus rings land
        // as either an outline or a ring-style box-shadow depending on the
        // primitive, so accept either.
        const hasIndicator =
          (info.outline !== 'none' && info.outlineWidth !== '0px') ||
          (info.boxShadow !== 'none' && info.boxShadow !== '');
        expect(
          hasIndicator,
          `${surface.name}: focused <${info.tag}> has no visible focus indicator`
        ).toBe(true);
      }

      // No dialog is open on these routes, so a cycle of only a couple of
      // stops means focus is penned in — a trap or a broken tab order — rather
      // than a legitimately short page. Sign-in alone exposes far more.
      expect(
        seen.size,
        `${surface.name} exposed only ${seen.size} keyboard stops${cycled ? ' before wrapping' : ''} — focus appears penned in`
      ).toBeGreaterThan(5);
    });
  }
});
