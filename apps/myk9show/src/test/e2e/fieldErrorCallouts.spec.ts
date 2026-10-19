import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { installSharedStagingWriteGuard } from './helpers/sharedStagingWriteGuard';
import { expectNoHorizontalOverflow } from './helpers/horizontalOverflow';
import { signInAsAdmin, signInAsExhibitor, signInAsSecretary } from './helpers/testUsers';

/**
 * MYK9-1256: a required-field error sits beside its own field (an arrow callout), at a phone width
 * and on a desktop, with no sideways page scroll, and the failing control holds focus. Only
 * rendered geometry can show this, so the unit tests cannot stand in for it.
 *
 * READ-ONLY. Every case submits a form with the failing field empty, so the client refuses it
 * before any request. The shared-staging write guard is installed on every page as a second
 * line of defence, and each case asserts that it blocked nothing.
 *
 * Add Promo Code is neither converted nor covered: AddPromoCodeDialog is not mounted anywhere in
 * the app today (its PromoCodesSection has no caller), so there is no real route to open it from.
 */

const VIEWPORTS = [
  { label: '375', width: 375, height: 812 },
  { label: '1280', width: 1280, height: 800 },
] as const;

async function installGuard(page: Page) {
  const ledger: Parameters<typeof installSharedStagingWriteGuard>[1] extends infer O
    ? O extends { ledger?: infer L }
      ? NonNullable<L>
      : never
    : never = [];
  await installSharedStagingWriteGuard(page, { ledger });
  return ledger;
}

/**
 * The focus step scrolls smoothly (and Playwright first scrolled the page down to click Next),
 * so measure only once the scroll position has held still for several samples.
 */
async function waitForScrollToSettle(page: Page) {
  let last = -1;
  let still = 0;
  for (let i = 0; i < 60 && still < 5; i++) {
    const y = await page.evaluate(() => Math.round(window.scrollY));
    still = y === last ? still + 1 : 0;
    last = y;
    await page.waitForTimeout(100);
  }
  expect(still, 'the page stopped scrolling').toBeGreaterThanOrEqual(5);
}

/** The callout is on screen, the page does not pan sideways, and the control holds focus. */
async function expectCalloutAndFocus(
  page: Page,
  callout: Locator,
  control: Locator,
  label: string,
  testInfo: TestInfo
) {
  await expect(callout, `${label}: callout visible`).toBeVisible();
  await expect(control, `${label}: control focused`).toBeFocused();
  await expect(control).toHaveAttribute('aria-invalid', 'true');
  await waitForScrollToSettle(page);
  const box = await callout.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box, `${label}: callout has a box`).not.toBeNull();
  expect(box!.x, `${label}: callout left edge in viewport`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `${label}: callout right edge in viewport`).toBeLessThanOrEqual(
    viewport.width + 1
  );
  expect(box!.y, `${label}: callout top in viewport`).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height, `${label}: callout bottom in viewport`).toBeLessThanOrEqual(
    viewport.height + 1
  );
  await expectNoHorizontalOverflow(page, label);
  // The focused control is not hidden under sticky page chrome.
  const covered = await control.evaluate(el => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 20));
    const hit = top && (el === top || el.contains(top) || top.contains(el));
    return hit
      ? null
      : `${top?.tagName}.${String(top?.className).slice(0, 60)} rect=${JSON.stringify(r)}`;
  });
  expect(covered, `${label}: control is covered by other content`).toBeNull();
  const scroll = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scroll.scrollWidth, `${label}: no page-level horizontal scroll`).toBeLessThanOrEqual(
    scroll.clientWidth
  );
  await page.screenshot({ path: testInfo.outputPath(`${label}.png`) });
}

for (const vp of VIEWPORTS) {
  test.describe(`field-error callouts @ ${vp.label}px`, () => {
    test.beforeEach(async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: vp.width, height: vp.height });
    });

    test(`Add Show class step: the callout sits under its own trial's tab @ ${vp.label}`, async ({
      page,
    }, testInfo) => {
      const ledger = await installGuard(page);
      await signInAsSecretary(page, '/secretary/create-show/wizard');
      await expect(page.getByRole('heading', { name: 'Add Show', level: 2 })).toBeVisible({
        timeout: 20_000,
      });

      // The wizard is a client-side draft: nothing is written until the Review step creates the
      // show. Put a complete Step 1 and four trials (the second has no class) straight into the
      // dev server's store, then press the real Next on the class step.
      await page.evaluate(async () => {
        const mod = await import(/* @vite-ignore */ '/src/store/wizardStore.ts');
        const klass = {
          templateId: 'tmpl-e2e',
          customizations: {
            className: 'Container Novice A',
            element: 'Container',
            level: 'Novice',
            section: 'A',
            displayOrder: 1,
            fieldOverrides: {},
          },
        };
        const trial = (id: string, name: string, classes: unknown[]) => ({
          id,
          nameOverride: name,
          trialDate: '2026-11-07',
          startTimeDraft: '9:00 AM',
          eventNumber: `E-${id}`,
          trialType: 'Scent Work',
          classes,
        });
        const state = mod.useWizardStore.getState();
        mod.useWizardStore.setState({
          show: {
            ...state.show,
            name: 'E2E Geometry Probe',
            organization: 'AKC',
            startDate: '2026-11-07T12:00:00.000Z',
            endDate: '2026-11-08T12:00:00.000Z',
            location: 'Austin, TX',
            clubId: 'club-e2e',
            officials: { chairman: ['p1'], secretary: ['p2'], steward: [] },
          },
          trials: [
            trial('a', 'Saturday AM', [klass]),
            trial('b', 'Saturday PM', []),
            trial('c', 'Sunday AM', [klass]),
            trial('d', 'Sunday PM', [klass]),
          ],
          currentStep: 2,
        });
      });

      const tab = page.getByRole('tab', { name: /Saturday PM/ });
      await expect(tab).toBeVisible({ timeout: 15_000 });
      // Let the class list finish loading: it grows the page, and a scroll made before that
      // lands the tab somewhere else once the content arrives.
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await expect(page.getByRole('button', { name: 'Select All' }).first()).toBeVisible({
        timeout: 20_000,
      });
      await page.getByRole('button', { name: /^Next$/ }).click();

      const callout = page.locator('#class-trial-b-error');
      await expect(callout).toHaveText('Saturday PM needs at least one class');
      await expectCalloutAndFocus(page, callout, tab, `class-step-${vp.label}`, testInfo);

      // The arrow's box starts inside its own tab's horizontal extent.
      const tabBox = (await tab.boundingBox())!;
      const calloutBox = (await callout.boundingBox())!;
      expect(calloutBox.x).toBeGreaterThanOrEqual(tabBox.x - 1);
      expect(calloutBox.x).toBeLessThanOrEqual(tabBox.x + tabBox.width);
      // Only that trial is flagged.
      await expect(page.getByRole('tab', { name: /Saturday AM/ })).not.toHaveAttribute(
        'aria-invalid',
        'true'
      );
      expect(ledger.filter(entry => entry.disposition === 'blocked')).toEqual([]);
    });

    test(`Create Role: no permission selected @ ${vp.label}`, async ({ page }, testInfo) => {
      const ledger = await installGuard(page);
      await signInAsAdmin(page, '/admin/permissions/roles/new');
      await page.getByLabel(/^Display Name/).fill('E2E Geometry Probe');
      await page.getByLabel(/^Role Name/).fill('e2e_geometry_probe_never_saved');
      await page.getByRole('button', { name: /next: permissions/i }).click();
      await page.getByRole('button', { name: /next: review/i }).click();
      // The role is never created: with no permission the client refuses before any request.
      await page.getByRole('button', { name: /^Create Role$/ }).click();

      const group = page.getByRole('group', { name: 'Permissions' });
      const callout = page.locator('#role-permissions-error');
      await expect(callout).toHaveText('Select at least one permission.');
      await expectCalloutAndFocus(page, callout, group, `create-role-${vp.label}`, testInfo);
      expect(ledger.filter(entry => entry.disposition === 'blocked')).toEqual([]);
    });

    test(`Edit Medication: cleared name @ ${vp.label}`, async ({ page }, testInfo) => {
      const ledger = await installGuard(page);
      await signInAsExhibitor(page, '/dogs');
      await page.waitForLoadState('networkidle').catch(() => undefined);
      const dogLink = page.locator('a[href^="/dogs/"]').first();
      await expect(dogLink, 'the exhibitor account has a dog').toBeVisible({ timeout: 30_000 });
      await dogLink.click();
      await page.getByRole('tab', { name: /records/i }).click();
      const edit = page.getByRole('button', { name: /edit medication/i }).first();
      await page.screenshot({ path: testInfo.outputPath(`medication-lookup-${vp.label}.png`) });
      test.skip(
        !(await edit.isVisible({ timeout: 15_000 }).catch(() => false)),
        'The demo exhibitor is not Premium (Records are read-only, no edit controls) and the spec never creates records or upgrades the account.'
      );
      await edit.click();

      const dialog = page.getByRole('dialog');
      const name = dialog.getByLabel(/^Name/);
      await name.fill('');
      await dialog.getByRole('button', { name: /^Save$/ }).click();

      const callout = dialog.locator('#editMedicationName-error');
      await expect(callout).toHaveText('Enter the medication name.');
      await expectCalloutAndFocus(page, callout, name, `edit-medication-${vp.label}`, testInfo);
      expect(ledger.filter(entry => entry.disposition === 'blocked')).toEqual([]);
    });
  });
}
