/**
 * Task 7.6 — automated accessibility pass plus keyboard-only walkthrough over
 * the exhibitor surfaces this change touched.
 *
 * READ-ONLY. Signs in, scans, and tabs. Submits nothing.
 *
 * Entitlement prerequisite: the seeded exhibitor holds an ACTIVE complimentary
 * grant on staging (2026-07-25 → 2026-10-23, issued via
 * admin_grant_entitlement). Without it the Premium record forms never render
 * and this suite reports them "clean" without having scanned anything — gated
 * UI hides its defects from a scanner exactly as it hides them from a user.
 * That is not hypothetical: the free-tier run passed Dog Details while three
 * `aria-prohibited-attr` nodes sat unscanned in the gated Title Progress pips.
 * When the grant lapses, renew it or these tests will fail at the trigger
 * assertion rather than silently degrade.
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

/**
 * Every exhibitor surface 7.6 names, including each Records view in its own
 * right. Scanning only the default Dog Details Overview would leave Health,
 * Training and Pedigree unscanned as PAGES — the Premium-form cases below open
 * their dialogs, but a dialog scan is scoped to the dialog and says nothing
 * about the page behind it.
 *
 * `ready` is the surface's own content, not the app shell. `waitForAppShell`
 * only proves the route chunk mounted; a slow query can leave a skeleton or an
 * error state on screen, and axe would happily scan that and report it clean.
 */
const SURFACES = [
  { name: 'Dog Details', path: `/dogs/${SEED_DOG_ID}`, ready: /Willow/ },
  {
    name: 'Dog Health',
    path: `/dogs/${SEED_DOG_ID}?section=records&view=health`,
    ready: /Add (Health Record|Event)/,
  },
  {
    name: 'Dog Training',
    path: `/dogs/${SEED_DOG_ID}?section=records&view=training`,
    ready: /Add (Training Session|First Session)/,
  },
  {
    name: 'Dog Pedigree',
    path: `/dogs/${SEED_DOG_ID}?section=records&view=pedigree`,
    ready: /Add (Sire|Dam)/,
  },
  { name: 'My Payments', path: '/exhibitor/payments', ready: /Amount due|paid up/ },
  { name: 'Subscription', path: '/subscription', ready: /free plan|Premium/ },
  { name: 'Pricing', path: '/pricing-page', ready: /Subscribe Now|You have/ },
] as const;

/**
 * Waits for the SURFACE's own content, not merely the route shell. Without
 * this a slow data request lets axe scan a skeleton — and a skeleton has no
 * violations, so the scan reports clean while proving nothing.
 */
async function waitForSurface(page: Page, ready: RegExp, label: string) {
  await expect(
    page.locator('body'),
    `${label}: surface content never rendered — scan would have hit a skeleton`
  ).toHaveText(ready, { timeout: 25000 });
}

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

  // A scoped scan whose selector matched nothing reports zero violations and
  // looks identical to a clean pass. Require evidence that axe actually
  // inspected something before believing the result.
  if (include) {
    expect(
      results.passes.length + results.violations.length + results.incomplete.length,
      `${name}: axe inspected no nodes — did "${include}" match anything?`
    ).toBeGreaterThan(0);
  }

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
      await waitForSurface(page, surface.ready, surface.name);
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
   * The Premium record forms, scanned OPEN. These are gated, so they are
   * invisible to a free-tier scan — the seeded account holds an active
   * complimentary grant precisely so they render. Scoped to the dialog itself:
   * the page behind it is covered by the Dog Details case above, and a dialog
   * aria-hides that page, which would otherwise report the backdrop's Base UI
   * focus guards rather than anything about the form.
   */
  const PREMIUM_FORMS = [
    // The health timeline names its add CTA for the content state: "Add Health
    // Record" when empty, "Add Event" once entries exist.
    { view: 'health', trigger: /^Add (Health Record|Event)$/i },
    { view: 'training', trigger: /^Add (Training Session|First Session)$/i },
    // Pedigree has no generic "add ancestor" — Slice 3.5's grouped layout
    // gives each slot its own relationship-named trigger.
    { view: 'pedigree', trigger: /^Add (Sire|Dam|Grandsire|Granddam)$/i },
  ] as const;

  for (const form of PREMIUM_FORMS) {
    test(`Premium ${form.view} form is accessible when open`, async ({ page }) => {
      await signInAsTestUser(page, 'DEMO_EXHIBITOR');
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(`/dogs/${SEED_DOG_ID}?section=records&view=${form.view}`);
      await waitForAppShell(page);

      // If the trigger is absent the entitlement gate is still closed, and a
      // silent skip would report this surface as covered when it was not.
      const trigger = page.getByRole('button', { name: form.trigger }).first();
      await expect(
        trigger,
        `${form.view}: add-form trigger not found — is the Premium gate still closed?`
      ).toBeVisible({ timeout: 20000 });
      await trigger.click();

      const dialog = page.getByRole('dialog').first();
      await expect(dialog).toBeVisible({ timeout: 15000 });
      await page.waitForTimeout(750);

      await assertNoBlockingViolations(page, `Premium ${form.view} form`, '[role="dialog"]');
    });
  }

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

/**
 * Walks tab order and returns the number of distinct stops reached.
 *
 * Two things here are deliberate, both because the obvious versions produce
 * false passes:
 *
 *  1. Revisits are detected by marking the ELEMENT (a data attribute), not by
 *     hashing its tag and label. Repeated row actions — "Remove", "Edit" — share
 *     a label, so a label-keyed set treats the second one as a completed cycle
 *     and stops walking a page it has barely entered.
 *  2. A focus indicator is confirmed by COMPARING focused against unfocused
 *     styling on the same element. Accepting any non-empty box-shadow passes
 *     controls that carry `shadow-sm` while unfocused, so deleting their focus
 *     ring entirely would leave the assertion green.
 */
async function walkTabOrder(page: Page, label: string, maxStops = 40): Promise<number> {
  let stops = 0;

  for (let i = 0; i < maxStops; i += 1) {
    await page.keyboard.press('Tab');

    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      if (el.dataset.kbSeen === '1') return { revisited: true } as const;
      el.dataset.kbSeen = '1';

      const focused = window.getComputedStyle(el);
      const focusedStyle = {
        outlineStyle: focused.outlineStyle,
        outlineWidth: focused.outlineWidth,
        outlineColor: focused.outlineColor,
        boxShadow: focused.boxShadow,
        backgroundColor: focused.backgroundColor,
      };

      // Measure the same element without focus, then restore it, so the
      // comparison isolates what focus actually changes.
      el.blur();
      const blurred = window.getComputedStyle(el);
      const blurredStyle = {
        outlineStyle: blurred.outlineStyle,
        outlineWidth: blurred.outlineWidth,
        boxShadow: blurred.boxShadow,
      };
      el.focus();

      return {
        revisited: false as const,
        tag: el.tagName.toLowerCase(),
        name: el.getAttribute('aria-label') ?? el.textContent?.slice(0, 40) ?? '',
        focusedStyle,
        blurredStyle,
      };
    });

    if (!info) continue;
    if (info.revisited) break;

    // A ring can be drawn by width, by colour on a constant-width transparent
    // outline, by box-shadow (Tailwind's focus-visible:ring-*), or by a
    // background change. Any DIFFERENCE between focused and unfocused counts;
    // sameness in all of them means focus is invisible.
    const gainedOutline =
      info.focusedStyle.outlineStyle !== 'none' &&
      info.focusedStyle.outlineWidth !== '0px' &&
      (info.focusedStyle.outlineWidth !== info.blurredStyle.outlineWidth ||
        info.focusedStyle.outlineColor !== info.blurredStyle.outlineColor);
    const gainedShadow = info.focusedStyle.boxShadow !== info.blurredStyle.boxShadow;
    const gainedBackground =
      info.focusedStyle.backgroundColor !== info.blurredStyle.backgroundColor;

    expect(
      gainedOutline || gainedShadow || gainedBackground,
      `${label}: focusing <${info.tag}> "${info.name}" changed nothing visually ` +
        `(outline ${info.blurredStyle.outlineWidth} -> ${info.focusedStyle.outlineWidth}, ` +
        `shadow unchanged: ${info.focusedStyle.boxShadow === info.blurredStyle.boxShadow})`
    ).toBe(true);

    stops += 1;
  }

  return stops;
}

test.describe('Slice 5: keyboard-only walkthrough', () => {
  test.setTimeout(240_000);

  for (const surface of SURFACES) {
    test(`${surface.name} is reachable and focus stays visible by keyboard`, async ({ page }) => {
      await signInAsTestUser(page, 'DEMO_EXHIBITOR');
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(surface.path);
      await waitForAppShell(page);
      await waitForSurface(page, surface.ready, surface.name);

      const stops = await walkTabOrder(page, surface.name);

      // No dialog is open on these routes, so a cycle of only a couple of stops
      // means focus is penned in — a trap or broken tab order — rather than a
      // legitimately short page. The signed-in shell alone exposes more.
      expect(
        stops,
        `${surface.name} exposed only ${stops} keyboard stops — focus appears penned in`
      ).toBeGreaterThan(5);
    });
  }

  /** 7.6 names the Payments mobile layout specifically, not just its desktop form. */
  test('My Payments is keyboard operable at 390px', async ({ page }) => {
    await signInAsTestUser(page, 'DEMO_EXHIBITOR');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/exhibitor/payments');
    await waitForAppShell(page);
    await waitForSurface(page, /Amount due|paid up/, 'My Payments (390px)');

    const stops = await walkTabOrder(page, 'My Payments (390px)');
    expect(stops, `My Payments (390px) exposed only ${stops} keyboard stops`).toBeGreaterThan(3);
  });

  /** The admin grant control is a required 7.6 surface for keyboard too. */
  test('admin grant control is keyboard operable', async ({ page }) => {
    await signInAsTestUser(page, 'SITE_ADMIN');
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/people/${SEED_PERSON_ID}`);
    await waitForAppShell(page);
    await page.getByRole('button', { name: /^edit/i }).first().click();
    await expect(
      page.getByPlaceholder(/Why is this user receiving complimentary Premium\?/i)
    ).toBeVisible({ timeout: 20000 });

    const stops = await walkTabOrder(page, 'Admin grant control');
    expect(stops, `Admin grant control exposed only ${stops} keyboard stops`).toBeGreaterThan(3);
  });
});
