import { test, expect, type Page } from '@playwright/test';
import { signInAsSecretary } from './uat/shared/auth';
import { harnessKnownAnswers, measureAddDogPanel } from './helpers/addDogPanelGeometry';
import { chooseAction } from './helpers/actionsMenu';

/**
 * MYK9-1121 — rendered geometry of the Add Dog slide-out (Dogs page) from 320px
 * up: the Call Name field's inset, the tab strip's fit, and the green check on
 * the tabs. A production walk of Quick Create at 375px had found the fields
 * inset ~73px a side (double padding) and "Registration" / "Optional details"
 * overlapping; the panel variant now hosts the same body (MYK9-1116), and this
 * pins that it stays right. jsdom has no layout engine, so none of this is
 * checkable in the unit suite.
 *
 * Read-only: it opens the panel, types into the unsaved form and closes it. It
 * never presses Add Dog / Save, so nothing is written. Secretary-authed, so it
 * runs in the Nightly regression list (see playwright.ci.config.ts).
 */

const WIDTHS = [320, 375, 768, 1440];
/** SlideOverPanel's `p-6` content gutter, and the photo (w-24) + its gap-4. */
const GUTTER = 24;
const PHOTO_AND_GAP = 96 + 16;

async function openAddDog(page: Page) {
  await signInAsSecretary(page, '/dogs');
  await chooseAction(page, 'Add Dog');
}

for (const width of WIDTHS) {
  test(`Add Dog panel geometry @ ${width}px`, async ({ page }) => {
    // Sign-in plus a cold dev-server compile can eat most of the default 30s.
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 800 });
    await openAddDog(page);
    // Add Dog opens on its Registration step (MYK9-1162). A secretary may skip it, and this
    // spec measures the Essential fields, so it does that rather than saving a registration.
    await page.getByRole('button', { name: 'No registration number yet' }).click();

    const dialogs = page.getByRole('dialog');
    const callName = dialogs.getByLabel(/Call Name/i);
    await expect(callName).toBeVisible({ timeout: 20000 });
    // The skip hands focus to Call Name (MYK9-1162), and a focused Input scales to 1.02, which
    // getBoundingClientRect reports. Measure the field at rest, not its focus emphasis.
    await callName.blur();
    // The slide-over's open animation (and the focus scale's transition back) must finish
    // before rects mean anything.
    await expect(dialogs).toHaveCount(1);
    await page.waitForTimeout(600);

    // Known-answer checks first: a harness that cannot see overflow proves nothing.
    expect(await harnessKnownAnswers(page)).toEqual([]);

    const g = await measureAddDogPanel(callName);
    const measured = JSON.stringify(g);

    // One gutter on the right; none doubled (73px each side was the bug).
    expect(g.callNameInsetRight, measured).toBeGreaterThanOrEqual(GUTTER - 1);
    expect(g.callNameInsetRight, measured).toBeLessThanOrEqual(GUTTER + 8);
    // Left side is the gutter, the photo and its gap, then the input.
    expect(g.callNameInsetLeft, measured).toBeGreaterThanOrEqual(GUTTER + PHOTO_AND_GAP - 1);
    expect(g.callNameInsetLeft, measured).toBeLessThanOrEqual(GUTTER + PHOTO_AND_GAP + 8);
    expect(g.photoGap, measured).toBeGreaterThanOrEqual(12);
    expect(g.callNameWidth, measured).toBeGreaterThanOrEqual(150);

    // Every tab label sits inside its own tab: no spill, no overlap with a neighbour.
    expect(g.tabs).toHaveLength(3);
    // Registration first, then Essential, then Optional details (MYK9-1162).
    expect(
      g.tabs.map(tab => tab.label),
      measured
    ).toEqual([
      expect.stringContaining('Registration'),
      expect.stringContaining('Essential'),
      expect.stringContaining('Optional details'),
    ]);
    for (const tab of g.tabs) {
      expect(tab.scrollOverflow, `${tab.label}: ${measured}`).toBeLessThanOrEqual(0);
      expect(tab.labelPastLeft, `${tab.label}: ${measured}`).toBeLessThanOrEqual(0);
      expect(tab.labelPastRight, `${tab.label}: ${measured}`).toBeLessThanOrEqual(0);
      // docs/INTENT.md: never below 14px. Fit is solved in layout, not by shrinking text.
      expect(tab.labelFontSize, `${tab.label}: ${measured}`).toBeGreaterThanOrEqual(14);
    }

    // Fill the Essential tab (unsaved form state) so the REAL green check renders.
    await callName.fill('Geometry');
    await dialogs.getByRole('combobox', { name: /^Sex/ }).click();
    await page.getByRole('option', { name: /Male/ }).first().click();
    await dialogs.getByLabel(/Date of Birth/i).fill('2020-01-15');
    await dialogs.getByRole('combobox', { name: /^Owner/ }).click();
    await page.getByRole('listbox').getByRole('option').first().click();

    // The check zooms in over 200ms; measuring mid-animation reads a smaller check.
    await page.waitForTimeout(500);
    const checks = await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]'));
      const essential = tabs.find(t => /Essential/.test(t.textContent ?? ''));
      const registration = tabs.find(t => /Registration/.test(t.textContent ?? ''));
      const real = essential?.querySelector('svg.text-emerald-500');
      if (!essential || !registration || !real) return null;
      const box = (el: Element) => el.getBoundingClientRect();
      const overlaps = (a: DOMRect, b: DOMRect) =>
        a.right > b.left && a.left < b.right && a.bottom > b.top + 0.5 && a.top < b.bottom;
      const essentialLabel = box(essential.querySelector('span')!);
      const essentialCheckBox = box(real);
      // The Registration check only shows once a registration is complete; clone the
      // real Essential check into it (animation off: animate-in starts at scale 0).
      const clone = real.cloneNode(true) as SVGElement;
      clone.style.animation = 'none';
      registration.append(clone);
      const registrationCheckBox = box(clone);
      const registrationLabel = box(registration.querySelector('span')!);
      const result = {
        essentialCheckWidth: essentialCheckBox.width,
        essentialOverlap: overlaps(essentialCheckBox, essentialLabel),
        registrationCheckWidth: registrationCheckBox.width,
        registrationOverlap: overlaps(registrationCheckBox, registrationLabel),
        registrationSpill: registration.scrollWidth - registration.clientWidth,
      };
      clone.remove();
      return result;
    });
    expect(checks, 'a real Essential check should render once the tab is valid').not.toBeNull();
    const c = JSON.stringify(checks);
    // The check keeps a visible size at every width (it once shrank to 0-2px) and never
    // sits on top of a label.
    expect(checks?.essentialCheckWidth, c).toBeGreaterThanOrEqual(12);
    expect(checks?.registrationCheckWidth, c).toBeGreaterThanOrEqual(12);
    expect(checks?.essentialOverlap, c).toBe(false);
    expect(checks?.registrationOverlap, c).toBe(false);
    expect(checks?.registrationSpill, c).toBeLessThanOrEqual(0);

    // Leave without saving.
    await page.keyboard.press('Escape');
  });
}
