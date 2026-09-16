import { expect, test, type Page } from '@playwright/test';
import { signInAsAdmin } from './helpers/testUsers';

/**
 * MYK9-591: ThemeSelector's Theme Mode cards targeted `peer-data-[state=checked]`
 * and `[&:has([data-state=checked])]`, selectors Radix emitted but Base UI never
 * does (Base UI's Radio.Root emits `data-checked` / `data-unchecked` on the
 * role="radio" element — the `id` prop instead lands on a separate hidden
 * native `<input>` used for form association, so `#light` matches that input,
 * never the accessible radio). The selected card's primary border was therefore
 * dead CSS — selection was conveyed only by the separate Check icon.
 *
 * Tailwind classes have no computed styles under vitest/jsdom (LESSONS
 * source-text-tests), so this measures the rendered `border-color` in a real
 * browser rather than asserting on class strings.
 *
 * This spec mutates SHARED e2e-admin persisted state (`user_preferences.mode`),
 * unlike radio-checkbox-indicator-centering.spec.ts, which explicitly avoids this
 * radio group because it "upserts user_preferences on click and rescales the whole
 * app." To stay safe for the shared account this spec ALWAYS restores the original
 * mode before finishing, even on assertion failure (try/finally), so a later spec
 * on this account inherits the theme it found.
 *
 * The primary color token itself differs between Light and Dark (index.css), so
 * the "primary border" probe is recomputed AFTER each mode switch, never cached
 * from the page's initial theme.
 */

/** Computes the resolved border-color Tailwind's `border-primary` class produces
 * under the CURRENT theme, via a throwaway probe element — never a literal hex,
 * which would drift the moment a color-scheme token changes. */
async function computeBorderPrimaryColor(page: Page): Promise<string> {
  return page.evaluate(() => {
    const probe = document.createElement('div');
    probe.className = 'border-primary';
    probe.style.borderWidth = '2px';
    probe.style.borderStyle = 'solid';
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    document.body.appendChild(probe);
    const color = getComputedStyle(probe).borderTopColor;
    probe.remove();
    return color;
  });
}

test.describe('theme mode card selection border', () => {
  test('the selected Theme Mode card gets the primary border; the deselected one does not', async ({
    page,
  }) => {
    await signInAsAdmin(page);
    await page.goto('/account?section=appearance', { waitUntil: 'domcontentloaded' });

    const lightRadio = page.getByRole('radio', { name: /^Light\b/i });
    const darkRadio = page.getByRole('radio', { name: /^Dark\b/i });
    await expect(lightRadio).toBeVisible({ timeout: 30_000 });

    const originalId =
      (await lightRadio.getAttribute('aria-checked')) === 'true'
        ? 'light'
        : (await darkRadio.getAttribute('aria-checked')) === 'true'
          ? 'dark'
          : 'system';
    const targetId = originalId === 'light' ? 'dark' : 'light';
    const targetRadio = targetId === 'dark' ? darkRadio : lightRadio;

    try {
      const targetLabel = page.locator(`label[for="${targetId}"]`);
      await targetLabel.click();
      await expect(targetRadio).toHaveAttribute('aria-checked', 'true');

      const primaryColor = await computeBorderPrimaryColor(page);

      // Settle: the peer-data selector reacts to the aria/data flip on the same
      // frame, but poll rather than reading once to absorb any paint delay.
      await expect
        .poll(async () => targetLabel.evaluate(el => getComputedStyle(el).borderTopColor))
        .toBe(primaryColor);

      const originalLabel = page.locator(`label[for="${originalId}"]`);
      const deselectedBorderColor = await originalLabel.evaluate(
        el => getComputedStyle(el).borderTopColor
      );
      expect(
        deselectedBorderColor,
        'deselected card should keep the muted border, not the primary one'
      ).not.toBe(primaryColor);
    } finally {
      const restoreLabel = page.locator(`label[for="${originalId}"]`);
      await restoreLabel.click();
      const restoreRadio =
        originalId === 'light'
          ? lightRadio
          : originalId === 'dark'
            ? darkRadio
            : page.getByRole('radio', { name: /^System\b/i });
      await expect(restoreRadio).toHaveAttribute('aria-checked', 'true');
    }
  });
});
