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

    // UNSCOPED (MYK9-92). This used to scan only
    // `[data-testid="complimentary-premium-section"]`, which hid the
    // surrounding UserEditPanel's own debt — 7 unnamed Base UI buttons and the
    // hardcoded `bg-[#1a365d]` registry badge in registrationUtils.ts. Both are
    // fixed, so the whole panel is now in scope and must stay clean.
    await assertNoBlockingViolations(page, 'Admin grant control');
  });
});

/**
 * MYK9-95 — the focus-indicator check, and why it is shaped like this.
 *
 * The property under test is WCAG 2.4.7: a keyboard user must be able to SEE
 * where focus is. That is a statement about a DIFFERENCE — focused vs not — so
 * a check that only looks at the focused state cannot express it. The previous
 * revision accepted any non-empty outline or box-shadow, which every control
 * carrying `shadow-sm` (SelectTrigger, selected tabs, most cards) satisfies
 * with its focus ring deleted outright.
 *
 * Three techniques were considered:
 *
 *  1. VISUAL DIFFING — screenshot the element focused and unfocused, compare
 *     pixels. Rejected. This app animates almost everything it styles
 *     (`transition-all duration-300`, `hover:-translate-y-[1px]`,
 *     `animate-in slide-in-from-bottom-2`), and avatars/images decode
 *     asynchronously. Ambient pixel churn between the two captures reads as
 *     "the indicator changed", so a deleted focus ring would still PASS. The
 *     failure mode is the one that matters here, so noise is disqualifying.
 *  2. AXE — rejected: axe-core ships no focus-appearance rule. Focus
 *     visibility is explicitly on its "cannot be automatically detected" list,
 *     and a custom rule would still need its own before/after measurement,
 *     which is exactly the problem being solved rather than an answer to it.
 *  3. REAL KEYBOARD INPUT ONLY — chosen. Never call `el.focus()` or
 *     `el.blur()`. Tab to the element, let it settle, measure; press Tab again
 *     and measure THE SAME element, which is now genuinely unfocused, having
 *     been unfocused by the keyboard. This is what killed the earlier
 *     attempts: programmatic `blur()` is precisely what does not clear
 *     `:focus-visible` reliably, which is why they saw an implausible constant
 *     3px outline in "both" states. Nothing here is programmatic, so nothing
 *     depends on how `blur()` interacts with focus modality.
 *
 * The unconditional-pass trap is closed STRUCTURALLY, not by care. Both
 * readings come from the same `readFocusStyle()` over the same `STYLE_PROPS`
 * list, and `diffKeys` iterates that list rather than naming properties. There
 * is no way to compare a captured property against an absent one, because
 * neither side can capture a different set from the other.
 *
 * Both halves are asserted: the focused state must render SOME ring (a diff
 * alone would accept a ring that merely disappears on focus), and the diff must
 * be non-empty (presence alone is the weak check being replaced).
 *
 * Ancestors are included in the reading because a ring is often drawn by a
 * wrapper via `:focus-within` rather than by the focused node itself.
 *
 * Revisits are detected by marking the ELEMENT, not by hashing tag and label:
 * repeated row actions ("Remove", "Edit") share a label, so a label-keyed set
 * treats the second one as a completed cycle and stops walking a page it has
 * barely entered.
 */
const STYLE_PROPS = [
  'outlineStyle',
  'outlineWidth',
  'outlineColor',
  'outlineOffset',
  'boxShadow',
  'backgroundColor',
  'borderColor',
  'borderWidth',
  'textDecorationLine',
  'filter',
  'content',
] as const;

/** `transparent`, or any rgb/rgba whose alpha is 0. */
const isTransparent = (color: string): boolean =>
  color === 'transparent' || /,\s*0\s*\)\s*$/.test(color);

/**
 * Reduces one scope's raw properties to only what a sighted user can SEE as a
 * ring. Everything invisible is dropped, which is the whole trick:
 *
 *  - Tailwind's `outline-none` does not remove the outline, it sets
 *    `outline: 2px solid transparent` (so Windows forced-colors mode keeps a
 *    ring). Chromium therefore reports a 2px outline on focus and none when
 *    blurred — for a control with NO focus styling at all. That artifact is
 *    what produced the earlier attempts' implausible "constant 2px/3px
 *    outline", and on the first cut of this check it let a deliberately
 *    deleted focus ring pass: the property-level delta was real, the pixels
 *    were not.
 *  - Tailwind's ring machinery likewise emits fully transparent box-shadow
 *    layers (`rgba(0,0,0,0) 0 0 0 0`) as placeholders.
 *
 * So a transparent outline, a transparent shadow layer and a zero-width border
 * all reduce to nothing, and a signature that stays empty means nothing is
 * drawn.
 */
function ringSignature(reading: StyleReading, prefix: string): string {
  const get = (prop: string) => reading[`${prefix}|${prop}`] ?? '';
  const parts: string[] = [];

  const outlineVisible =
    get('outlineStyle') !== 'none' &&
    get('outlineWidth') !== '0px' &&
    !isTransparent(get('outlineColor'));
  if (outlineVisible) {
    parts.push(
      `outline:${get('outlineStyle')}/${get('outlineWidth')}/${get('outlineColor')}/${get('outlineOffset')}`
    );
  }

  const shadow = get('boxShadow');
  if (shadow && shadow !== 'none') {
    // Split top-level commas only — colours carry their own commas.
    const layers: string[] = [];
    let depth = 0;
    let current = '';
    for (const ch of shadow) {
      if (ch === '(') depth += 1;
      if (ch === ')') depth -= 1;
      if (ch === ',' && depth === 0) {
        layers.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    layers.push(current);
    const visible = layers.map(l => l.trim()).filter(l => l && !isTransparent(l.split(' ')[0]));
    if (visible.length > 0) parts.push(`shadow:${visible.join(' | ')}`);
  }

  if (get('textDecorationLine') && get('textDecorationLine') !== 'none') {
    parts.push(`underline:${get('textDecorationLine')}`);
  }

  if (get('borderWidth') !== '0px' && !isTransparent(get('borderColor'))) {
    parts.push(`border:${get('borderWidth')}/${get('borderColor')}`);
  }

  const content = get('content');
  if (content && content !== 'none' && content !== 'normal') {
    parts.push(`content:${content}`);
  }

  return parts.join(' ; ');
}

/** Every scope (`depth|pseudo`) present in a reading. */
const scopePrefixes = (reading: StyleReading): string[] =>
  Array.from(new Set(Object.keys(reading).map(k => k.split('|').slice(0, 2).join('|'))));

type StyleReading = Record<string, string>;

interface StopRecord {
  tag: string;
  name: string;
  focused: StyleReading;
}

/** Style transitions run up to 300ms in this app; measure only once settled. */
const SETTLE_MS = 380;

async function walkTabOrder(page: Page, label: string, maxStops = 40): Promise<number> {
  /**
   * Installed into the page once per walk. Both the focused and the unfocused
   * reading go through this single function, so the two sides are guaranteed to
   * carry identical keys — the vacuous-pass trap is closed by construction.
   */
  await page.evaluate(props => {
    (
      window as unknown as { __readFocusStyle: (el: Element) => Record<string, string> }
    ).__readFocusStyle = (el: Element) => {
      const reading: Record<string, string> = {};
      // The focused node plus two ancestors: rings are frequently drawn by a
      // wrapper via :focus-within rather than by the control itself.
      const scopes = [el, el.parentElement, el.parentElement?.parentElement ?? null];
      scopes.forEach((node, depth) => {
        if (!node) return;
        ([null, '::before', '::after'] as const).forEach(pseudo => {
          const cs = window.getComputedStyle(node, pseudo);
          props.forEach(p => {
            reading[`${depth}|${pseudo ?? 'self'}|${p}`] = String(
              cs[p as keyof CSSStyleDeclaration]
            );
          });
          if (pseudo) reading[`${depth}|${pseudo}|content`] = String(cs.content);
        });
      });
      return reading;
    };
  }, STYLE_PROPS as unknown as string[]);

  const readFocused = async (index: number) =>
    page.evaluate(idx => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      if (el.dataset.kbIdx !== undefined) return { revisited: true } as const;
      el.dataset.kbIdx = String(idx);
      const read = (window as unknown as { __readFocusStyle: (n: Element) => StyleReading })
        .__readFocusStyle;
      return {
        revisited: false as const,
        tag: el.tagName.toLowerCase(),
        name: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40),
        focused: read(el),
      };
    }, index);

  /** Re-measures a previously visited element, which the keyboard has now left. */
  const readUnfocused = async (index: number) =>
    page.evaluate(idx => {
      const el = document.querySelector(`[data-kb-idx="${idx}"]`) as HTMLElement | null;
      if (!el) return null;
      if (document.activeElement === el) return null; // still focused — not a valid reading
      const read = (window as unknown as { __readFocusStyle: (n: Element) => StyleReading })
        .__readFocusStyle;
      return read(el);
    }, index);

  /**
   * Property keys whose value differs. Driven by the readings' own keys, so a
   * property can never be compared against an absent one.
   */
  const diffKeys = (focused: StyleReading, unfocused: StyleReading): string[] => {
    const keys = Object.keys(focused);
    expect(
      Object.keys(unfocused).sort(),
      `${label}: focused and unfocused readings captured different properties — ` +
        'a comparison against an absent value is always true and would pass vacuously'
    ).toEqual(keys.slice().sort());
    return keys.filter(k => focused[k] !== unfocused[k]);
  };

  const assertStop = (index: number, rec: StopRecord, unfocused: StyleReading) => {
    // Runs purely for its structural guard: it proves both readings carry the
    // identical key set, so no comparison below can be against an absent value.
    diffKeys(rec.focused, unfocused);

    // A raw property delta is NOT enough on its own. Tabbing away also drops
    // `:focus-within` from the ancestors, and `outline-none` toggles a
    // transparent outline — both produce a real delta with nothing visible.
    // So compare VISIBLE ring signatures, and require the focused side to be
    // the one that renders something (a ring which vanishes on focus is not an
    // indicator).
    const evidence: string[] = [];
    const identical: string[] = [];

    for (const prefix of scopePrefixes(rec.focused)) {
      const focusedSig = ringSignature(rec.focused, prefix);
      const unfocusedSig = ringSignature(unfocused, prefix);
      if (focusedSig !== '' && focusedSig !== unfocusedSig) {
        evidence.push(`${prefix} → ${focusedSig || '(nothing)'}  (unfocused: ${unfocusedSig || '(nothing)'})`);
      } else if (focusedSig !== '') {
        identical.push(`${prefix} → ${focusedSig}`);
      }
    }

    if (process.env.KB_DEBUG) {
      console.log(
        `[kbdebug] stop ${index} <${rec.tag}> "${rec.name}" evidence=${JSON.stringify(evidence)}`
      );
    }

    expect(
      evidence.length,
      `${label}: <${rec.tag}> "${rec.name}" (stop ${index}) draws NO focus indicator.\n` +
        '        Nothing visible — outline, box-shadow, underline, border, an ::after bar —\n' +
        '        appears when it is focused that is not already there when it is not.\n' +
        '        A keyboard user cannot see where focus is (WCAG 2.4.7).\n' +
        `        Styling it carries in BOTH states: ${identical.slice(0, 4).join(' ;; ') || '(none)'}`
    ).toBeGreaterThan(0);
  };

  const pending = new Map<number, StopRecord>();
  let stops = 0;
  let done = false;

  for (let i = 0; i < maxStops && !done; i += 1) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(SETTLE_MS);

    // The element visited on the PREVIOUS iteration is now unfocused by
    // keyboard action alone. Measure it before anything else moves.
    for (const [idx, rec] of Array.from(pending.entries())) {
      const unfocused = await readUnfocused(idx);
      if (!unfocused) continue; // detached or somehow still focused — no honest reading
      pending.delete(idx);
      assertStop(idx, rec, unfocused);
    }

    const info = await readFocused(i);
    if (!info) continue;
    if (info.revisited) {
      done = true;
      break;
    }

    pending.set(i,{ tag: info.tag, name: info.name, focused: info.focused });
    stops += 1;
  }

  // Drain the final stop: one more Tab so it too is unfocused by the keyboard.
  if (pending.size > 0) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(SETTLE_MS);
    for (const [idx, rec] of Array.from(pending.entries())) {
      const unfocused = await readUnfocused(idx);
      pending.delete(idx);
      if (unfocused) assertStop(idx, rec, unfocused);
    }
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
