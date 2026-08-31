import { expect, test, type Page } from '@playwright/test';
import { signInAsExhibitor } from '../helpers/testUsers';
import { LIVE_REGISTRATION_SHOW_ID } from '../uat/shared/seededShows';

test.describe.configure({ mode: 'serial', timeout: 120000 });

const SHOW_ID = LIVE_REGISTRATION_SHOW_ID;
const VISUAL_MATRIX = [
  { name: 'phone-light', width: 390, height: 844, colorScheme: 'light' as const },
  { name: 'phone-dark', width: 390, height: 844, colorScheme: 'dark' as const },
  { name: 'tablet-light', width: 960, height: 652, colorScheme: 'light' as const },
  { name: 'tablet-dark', width: 960, height: 652, colorScheme: 'dark' as const },
];

function captureConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', error => errors.push(error.message));
  return errors;
}

async function assertWizardShell(page: Page, consoleErrors: string[]) {
  await expect(page.getByRole('heading', { name: 'Register for Show' })).toBeVisible({
    timeout: 20000,
  });
  await expect(page.getByTestId('registration-wizard-header')).toBeVisible();
  await expect(page.getByTestId('registration-wizard-card')).toBeVisible();

  const headerBox = await page.getByTestId('registration-wizard-header').boundingBox();
  const cardBox = await page.getByTestId('registration-wizard-card').boundingBox();
  expect(headerBox).not.toBeNull();
  expect(cardBox).not.toBeNull();
  expect(cardBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height);

  const firstCircle = await page.getByTestId('wizard-step-circle-0').boundingBox();
  const secondCircle = await page.getByTestId('wizard-step-circle-1').boundingBox();
  const connector = await page.getByTestId('wizard-step-connector-0').boundingBox();
  expect(firstCircle).not.toBeNull();
  expect(secondCircle).not.toBeNull();
  expect(connector).not.toBeNull();
  expect(connector!.x).toBeGreaterThanOrEqual(firstCircle!.x + firstCircle!.width - 1);
  expect(connector!.x + connector!.width).toBeLessThanOrEqual(secondCircle!.x + 1);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(Math.max(0, overflow)).toBe(0);
  expect(consoleErrors).toEqual([]);
}

async function selectFirstDog(page: Page) {
  await expect(page.getByRole('heading', { name: 'Select Dogs to Register' })).toBeVisible({
    timeout: 15000,
  });
  const namedDogOptions = page.locator('[role="checkbox"][aria-label^="Select "]');
  if ((await namedDogOptions.count()) > 0) {
    await namedDogOptions.first().click();
  } else {
    await page.getByRole('checkbox').first().click();
  }
  await expect(page.getByRole('button', { name: /^Next$/ })).toBeEnabled();
  await page.getByRole('button', { name: /^Next$/ }).click();
}

async function selectFirstClass(page: Page) {
  await expect(page.getByRole('heading', { name: 'Select Classes' })).toBeVisible({
    timeout: 15000,
  });
  const classes = page.getByRole('checkbox', { name: /^Select / });
  await expect(classes.first()).toBeVisible({ timeout: 15000 });
  await classes.first().click();
  await expect(page.getByRole('button', { name: /^Next$/ })).toBeEnabled();
  await page.getByRole('button', { name: /^Next$/ }).click();
}

for (const scenario of VISUAL_MATRIX) {
  test(`registration wizard ${scenario.name} has no shell regressions`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.emulateMedia({ colorScheme: scenario.colorScheme });
    await page.addInitScript(({ colorScheme }) => {
      localStorage.setItem('myK9Q_settings', JSON.stringify({ theme: colorScheme }));
    }, scenario);

    const consoleErrors = captureConsoleErrors(page);
    await signInAsExhibitor(page, `/shows/${SHOW_ID}/register`);
    await assertWizardShell(page, consoleErrors);

    await page.screenshot({
      path: testInfo.outputPath(`registration-wizard-${scenario.name}-dogs.png`),
      fullPage: true,
    });
    await selectFirstDog(page);
    await page.screenshot({
      path: testInfo.outputPath(`registration-wizard-${scenario.name}-classes.png`),
      fullPage: true,
    });
    await selectFirstClass(page);
    await expect(page.getByRole('heading', { name: 'Payment Information' })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`registration-wizard-${scenario.name}-payment.png`),
      fullPage: true,
    });

    await page.getByRole('button', { name: 'Save Draft' }).click();
    const saveDialog = page.getByRole('dialog');
    await expect(saveDialog).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`registration-wizard-${scenario.name}-draft-dialog.png`),
      fullPage: true,
    });
    await saveDialog.getByLabel('Draft Title').fill(`Visual QA ${scenario.name}`);
    await saveDialog.getByRole('button', { name: 'Save Draft' }).click();
    await expect(page.getByRole('button', { name: /Load Draft \(1\)/ })).toBeVisible();
  });
}

test('registration wizard covers dog, class, payment, and draft dialog states', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => {
    localStorage.setItem('myK9Q_settings', JSON.stringify({ theme: 'light' }));
  });

  const consoleErrors = captureConsoleErrors(page);
  await signInAsExhibitor(page, `/shows/${SHOW_ID}/register`);
  await assertWizardShell(page, consoleErrors);

  await selectFirstDog(page);
  await expect(page.getByRole('heading', { name: 'Select Classes' })).toBeVisible();
  await selectFirstClass(page);
  await expect(page.getByRole('heading', { name: 'Payment Information' })).toBeVisible();

  await page.getByRole('button', { name: 'Save Draft' }).click();
  const saveDialog = page.getByRole('dialog');
  await saveDialog.getByLabel('Draft Title').fill('Visual QA Draft');
  await saveDialog.getByRole('button', { name: 'Save Draft' }).click();

  await page.getByRole('button', { name: /^Back$/ }).click();
  await page.getByRole('button', { name: /^Back$/ }).click();
  const selectedDog = page.locator('[role="checkbox"][aria-checked="true"]').first();
  await expect(selectedDog).toBeVisible();
  await selectedDog.click();

  const loadDraftButton = page.getByRole('button', { name: /Load Draft \(1\)/ });
  await expect(loadDraftButton).toBeVisible();
  await loadDraftButton.click();
  const loadDialog = page.getByRole('dialog');
  await expect(loadDialog).toContainText('Visual QA Draft');
  await loadDialog.getByText('Visual QA Draft').click();
  await loadDialog.getByRole('button', { name: 'Load Selected Draft' }).click();
  await expect(page.getByText('Draft loaded successfully')).toBeVisible();
  await page.getByRole('button', { name: /^Back$/ }).click();
  await page.getByRole('button', { name: /^Back$/ }).click();
  await expect(page.locator('[role="checkbox"][aria-checked="true"]').first()).toBeVisible();

  await page.screenshot({
    path: testInfo.outputPath('registration-wizard-payment-and-draft.png'),
    fullPage: true,
  });
  await assertWizardShell(page, consoleErrors);
});

// Rounds 1-4 scored this page's accessibility from tokens and class strings
// because no browser was available, and both of the defects below survived all
// four. They are pinned here as RENDERED measurements: a source-level check
// would pass on the token's declared value, which is exactly what hid the dark
// -muted-foreground failure (it clears AA on the flat card and fails on the
// composited surfaces the wizard actually paints).

// Composites a colour over its ancestors' backgrounds and returns the WCAG
// ratio. Reads channels by compositing over black and over white rather than
// parsing the colour string: computed styles here serialise as
// color(srgb 0..1), whose components are NOT 8-bit, and parsing them as such
// makes every ratio collapse to ~1.0.
// Returns the WORST ratio across every match, not the first one. Selecting a
// single element made this assertion vacuous: the first .text-muted-foreground
// in the header is the 14px breadcrumb sitting on the flat page background,
// which passes on the old token too, so the test stayed green with the fix
// reverted. The defect lives on the 12px captions over the elevated panel.
const CONTRAST_OF = (selector: string) => {
  const els = Array.from(document.querySelectorAll(selector)).filter(el => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (!(r.width > 0 && r.height > 0)) return false;
    if (cs.visibility === 'hidden') return false;
    if (!(el.textContent || '').trim()) return false;
    // WCAG 1.4.3 exempts inactive controls, and this app dims them with
    // disabled:opacity-50 — "Load Draft (0)" measures 3.46:1 while disabled.
    // Counting them would fail the assertion on text the standard excuses.
    return !el.closest('[disabled],[aria-disabled="true"],:disabled');
  });
  if (!els.length) return null;
  const cv = document.createElement('canvas');
  cv.width = 1;
  cv.height = 1;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  const parse = (c: string) => {
    const sample = (backdrop: string) => {
      ctx.globalCompositeOperation = 'copy';
      ctx.fillStyle = backdrop;
      ctx.fillRect(0, 0, 1, 1);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = backdrop;
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, 1, 1);
      return ctx.getImageData(0, 0, 1, 1).data;
    };
    const w = sample('#fff');
    const b = sample('#000');
    const a = 1 - (w[0] - b[0]) / 255;
    return a <= 0.002 ? [0, 0, 0, 0] : [b[0] / a, b[1] / a, b[2] / a, a];
  };
  const lum = (rgb: number[]) => {
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
  };
  const over = (fg: number[], bg: number[]) => [
    fg[0] * fg[3] + bg[0] * (1 - fg[3]),
    fg[1] * fg[3] + bg[1] * (1 - fg[3]),
    fg[2] * fg[3] + bg[2] * (1 - fg[3]),
    1,
  ];
  let worst = Infinity;
  let worstText = '';
  for (const el of els) {
    // Composite the translucent layers rather than skipping to the first
    // opaque ancestor. The step-progress captions sit on a semi-transparent
    // tint over the card, so the surface they are actually read against is
    // rgb(48,38,32), not the card's #1e1c19 — a 3.96:1 caption looks like
    // 4.55:1 if the tint is ignored, which is what hid this defect.
    let bg: number[] = [255, 255, 255, 1];
    let acc: number[] | null = null;
    let cur: Element | null = el;
    while (cur) {
      const c = parse(getComputedStyle(cur).backgroundColor)!;
      if (c[3] > 0) {
        acc = acc ? over(acc, c) : c;
        if (c[3] === 1) {
          bg = acc;
          break;
        }
      }
      cur = cur.parentElement;
    }
    if (acc && acc[3] < 1) bg = over(acc, bg);
    // Fold in every ancestor's opacity, not just the element's own colour
    // alpha. The shared Button ships disabled:opacity-50, so a dimmed label
    // would otherwise be certified at the token's full contrast while its
    // rendered pixels are half-composited against the surface.
    let effOpacity = 1;
    let opCur: Element | null = el;
    while (opCur) {
      effOpacity *= Number(getComputedStyle(opCur).opacity);
      opCur = opCur.parentElement;
    }
    const rawFg = parse(getComputedStyle(el).color)!;
    const fg = [rawFg[0], rawFg[1], rawFg[2], rawFg[3] * effOpacity];
    const l1 = lum(over(fg, bg));
    const l2 = lum(bg);
    const r = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    if (r < worst) {
      worst = r;
      worstText =
        (el.textContent || '').trim().slice(0, 40) +
        ' [' +
        getComputedStyle(el).fontSize +
        ', n=' +
        els.length +
        ']';
    }
  }
  return { worst, worstText };
};

test('the only exit from the wizard meets the 44px touch floor', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsExhibitor(page, `/shows/${SHOW_ID}/register`);
  await expect(page.getByRole('heading', { name: 'Register for Show' })).toBeVisible({
    timeout: 20000,
  });
  // Measured 181x40 before the fix: size="default" is h-10, despite its
  // "Comfortable touch target" comment in buttonVariants.
  const exit = page.getByRole('button', { name: /Back to show/i }).first();
  const box = await exit.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

test('dark-mode muted captions clear WCAG AA on the composited wizard surfaces', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => {
    localStorage.setItem('myK9Q_settings', JSON.stringify({ theme: 'dark' }));
  });
  await signInAsExhibitor(page, `/shows/${SHOW_ID}/register`);
  await expect(page.getByRole('heading', { name: 'Register for Show' })).toBeVisible({
    timeout: 20000,
  });

  // Known answers first: if the measurement itself breaks, this test must fail
  // loudly rather than certify whatever it computed.
  const sanity = await page.evaluate(() => {
    const el = document.createElement('div');
    el.style.cssText = 'color:#000;background:#fff;position:fixed;top:0';
    el.id = 'contrast-sanity';
    el.textContent = 'x';
    document.body.appendChild(el);
    return true;
  });
  expect(sanity).toBe(true);
  const known = await page.evaluate(CONTRAST_OF, '#contrast-sanity');
  expect(known).not.toBeNull();
  expect(known!.worst).toBeGreaterThan(20.5); // black on white == 21

  // Wait for the dog list to actually populate. Measuring as soon as the
  // heading appears caught the page at "No eligible dogs found.", where the
  // elevated panel that carries the failing captions has not rendered — the
  // worst ratio then comes from the flat card (4.55:1), which passes on the
  // old token too, so the assertion certified nothing and would flake in CI.
  await expect(page.locator('[role="checkbox"][aria-label^="Select "]').first()).toBeVisible({
    timeout: 20000,
  });

  // Prove dark mode actually applied before measuring anything. Without this
  // the test passes vacuously when the theme fails to take: light mode uses a
  // darker muted token that clears AA everywhere, so a light render looks
  // exactly like a fix.
  const themeState = await page.evaluate(() => ({
    root: document.documentElement.className,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    muted: getComputedStyle(document.documentElement).getPropertyValue('--muted-foreground').trim(),
  }));
  console.log('THEME ' + JSON.stringify(themeState));
  const bodyIsDark = await page.evaluate(() => {
    const m = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g)!;
    return (+m[0] + +m[1] + +m[2]) / 3 < 128;
  });
  expect(bodyIsDark, 'dark theme must be active or this assertion is vacuous').toBe(true);

  // Every muted caption on the page, worst case. The step-progress
  // "Current"/"Done" captions sit on an elevated (composited) panel, where
  // stone-500 measured 3.96:1 and 4.26:1 while passing on the flat card.
  const muted = await page.evaluate(CONTRAST_OF, '.text-muted-foreground');
  expect(muted).not.toBeNull();
  console.log('WORST_MUTED ' + muted!.worst.toFixed(2) + ' :: ' + muted!.worstText);
  expect(muted!.worst, 'worst muted caption: ' + muted!.worstText).toBeGreaterThanOrEqual(4.5);
});
