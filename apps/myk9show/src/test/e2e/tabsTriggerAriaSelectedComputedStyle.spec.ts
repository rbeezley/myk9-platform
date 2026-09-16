import { expect, test } from '@playwright/test';
import { signInAsExhibitor } from './helpers/testUsers';

/**
 * MYK9-612: `@myk9/ui` `TabsTrigger` wraps Base UI's Tabs (packages/ui/src/
 * components/Tabs/Tabs.tsx), which styles the selected tab via `aria-selected`
 * — never the Radix-style `data-state="active"` attribute. Call sites across
 * the edit panels (DogEditPanel included) still carried `data-[state=active]:…`
 * overrides that could never match, so the intended active-tab gradient/shadow
 * treatment was dead CSS: every tab rendered with the same computed style
 * regardless of selection.
 *
 * Tailwind classes have no computed styles under vitest/jsdom (LESSONS
 * source-text-tests), so this reads the real computed style of the active vs.
 * an inactive tab trigger in a real browser rather than asserting on class
 * strings. Exhibitor-authed, read-only: opens the Edit Dog panel and never
 * saves, following the same pattern as dogPanelAccessibleNames.spec.ts.
 */
test('Edit Dog panel: active tab renders a distinct computed style from an inactive one', async ({
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

  // The Base UI Tabs primitive itself already differs `aria-selected` vs. not
  // (packages/ui/src/components/Tabs/Tabs.tsx: `aria-selected:bg-background
  // aria-selected:text-primary aria-selected:shadow-sm`, a plain background
  // COLOR), so a color/background-color comparison alone would pass even with
  // the dead `data-[state=active]` classes still in place — proven locally by
  // temporarily reverting the fix and re-running this spec (stayed green).
  // The call-site override this issue is about is specifically a GRADIENT
  // (`…:bg-gradient-to-r …:from-primary/10 …:to-primary/5`), which only ever
  // shows up as `background-image`; the primitive never sets one. Asserting on
  // `backgroundImage` is therefore the one probe that actually isolates the
  // dead CSS this issue describes.
  const readBackgroundImage = (locator: typeof activeTab) =>
    locator.evaluate(el => getComputedStyle(el).backgroundImage);

  const [activeBackgroundImage, inactiveBackgroundImage] = await Promise.all([
    readBackgroundImage(activeTab),
    readBackgroundImage(inactiveTab),
  ]);

  expect(activeBackgroundImage, 'active tab should render the gradient treatment').toContain(
    'gradient'
  );
  expect(inactiveBackgroundImage, 'inactive tab should not render a gradient').toBe('none');
});
