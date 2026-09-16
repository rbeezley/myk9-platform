import { expect, test, type Locator, type Page } from '@playwright/test';
import { signInAsExhibitor } from './helpers/testUsers';

/**
 * MYK9-612: `@myk9/ui` `TabsTrigger` wraps Base UI's Tabs (packages/ui/src/
 * components/Tabs/Tabs.tsx), which styles the selected tab via `aria-selected`
 * — never a Radix-style `data-state="active"` attribute. Call sites across the
 * edit panels and the load-test dashboard carried the former Radix data-state
 * overrides (a `bg-gradient-to-r` treatment) that could never match, so they
 * were dead CSS: every tab rendered with the primitive's own treatment
 * regardless of selection.
 *
 * Decision (revised on the Linear issue after review): DELETE the dead
 * overrides rather than repoint them to `aria-selected:`. Repointing them
 * verified against the installed tailwind-merge (3.6.0): the call-site
 * `bg-gradient-to-r` merge drops the primitive's own `aria-selected:
 * bg-background`, so the "restored" active tab would actually render WORSE
 * than what main ships today — a near-transparent wash instead of an opaque
 * pill. The primitive's own selected treatment is therefore the one source of
 * truth, and this spec is the regression guard for exactly that: it pins the
 * primitive's opaque `bg-background` pill on the active tab and asserts no
 * `background-image` sneaks back in on either tab (the failure mode a revived
 * override would reintroduce).
 *
 * Tailwind classes have no computed styles under vitest/jsdom (LESSONS
 * source-text-tests), so this reads the real computed style of the active vs.
 * an inactive tab trigger in a real browser rather than asserting on class
 * strings. Exhibitor-authed, read-only: opens the Edit Dog panel and never
 * saves, following the same pattern as dogPanelAccessibleNames.spec.ts.
 */

/** Computes the resolved `background-color` Tailwind's `bg-background` class
 * produces under the CURRENT theme, via a throwaway probe element — never a
 * literal color string, which would drift the moment a color-scheme token
 * changes. Same technique as theme-mode-selection-border.spec.ts (MYK9-591). */
async function computeBackgroundToken(page: Page): Promise<string> {
  return page.evaluate(() => {
    const probe = document.createElement('div');
    probe.className = 'bg-background';
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    document.body.appendChild(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return color;
  });
}

const readStyle = (locator: Locator) =>
  locator.evaluate(el => {
    const style = getComputedStyle(el);
    return { backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage };
  });

test('Edit Dog panel: the active tab gets the primitive opaque background; neither tab gets a background-image', async ({
  page,
}) => {
  await signInAsExhibitor(page, '/dogs');

  const firstDog = page.locator('h3 a[href^="/dogs/"]').first();
  await expect(firstDog).toBeVisible();
  await firstDog.click();
  await page.waitForURL(/\/dogs\/[0-9a-f-]{36}/, { waitUntil: 'commit' });

  await page.locator('[data-dog-identity]').getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Edit Dog' }).click();

  const activeTab = page.getByRole('tab', { name: /Basic Info/ });
  const inactiveTab = page.getByRole('tab', { name: /More for this dog/ });
  await expect(activeTab).toBeVisible();
  await expect(inactiveTab).toBeVisible();

  // The default tab ("basic") is selected on open; confirm that before reading
  // computed style so a future default-tab change fails loudly here instead of
  // silently comparing two inactive tabs.
  await expect(activeTab).toHaveAttribute('aria-selected', 'true');
  await expect(inactiveTab).toHaveAttribute('aria-selected', 'false');

  const backgroundToken = await computeBackgroundToken(page);
  const [activeStyle, inactiveStyle] = await Promise.all([
    readStyle(activeTab),
    readStyle(inactiveTab),
  ]);

  expect(
    activeStyle.backgroundColor,
    "the active tab should render the primitive's opaque bg-background pill"
  ).toBe(backgroundToken);
  expect(
    inactiveStyle.backgroundColor,
    'the inactive tab should not carry the selected background color'
  ).not.toBe(backgroundToken);

  // Regression guard: a revived call-site gradient override (or any future
  // one) would reintroduce a background-image on the active tab that the
  // primitive never sets on its own.
  expect(activeStyle.backgroundImage, 'active tab should have no background-image').toBe('none');
  expect(inactiveStyle.backgroundImage, 'inactive tab should have no background-image').toBe(
    'none'
  );
});
