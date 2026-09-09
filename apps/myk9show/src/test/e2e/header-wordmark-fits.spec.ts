import { test, expect, type Page } from '@playwright/test';
import { signInAsExhibitor } from './helpers/testUsers';

/**
 * The header brand must never render as "myK9S…".
 *
 * Signed in, the right-hand icon buttons left the wordmark 75px of the 114px
 * it needs at 375px, so it truncated at every phone width. Measuring the
 * SOURCE (class names) cannot see that; only rendered geometry can.
 */

const PHONE_WIDTHS = [360, 375, 390, 414] as const;
// Below 360 the wordmark is deliberately hidden and the mark carries the brand.
const NARROW_WIDTH = 320;

/**
 * Intrinsic width of the wordmark, measured by cloning the live node so every
 * class, tracking value and inherited style comes with it, then lifting only
 * the width constraint. `scrollWidth` is NOT usable here: on a clipped box it
 * reports the clipped width, so it under-reports exactly where it matters.
 */
async function measureWordmark(page: Page) {
  return page.evaluate(() => {
    const nav = document.querySelector('nav');
    if (!nav) throw new Error('header nav not found — selector drifted');
    const span = [...nav.querySelectorAll('span')].find(
      s => s.textContent?.trim() === 'myK9Show'
    ) as HTMLElement | undefined;

    const markVisible = (() => {
      const img = nav.querySelector('img');
      return !!img && img.getBoundingClientRect().width > 0;
    })();

    if (!span || span.getBoundingClientRect().width === 0) {
      return { rendered: false, markVisible, needs: 0, has: 0, control: 'n/a' };
    }

    const intrinsic = (text: string) => {
      const clone = span.cloneNode(true) as HTMLElement;
      clone.textContent = text;
      clone.style.cssText =
        'position:fixed;left:-9999px;top:0;white-space:nowrap;width:auto;max-width:none;overflow:visible';
      span.parentElement!.appendChild(clone);
      const w = clone.getBoundingClientRect().width;
      clone.remove();
      return w;
    };

    const needs = intrinsic('myK9Show');
    // Known-answer control: the measurement must respond to string length.
    // Without it a harness that always returns 0 would report a clean pass.
    const control = intrinsic('myK9ShowXXXX') > needs && intrinsic('my') < needs ? 'ok' : 'BROKEN';

    return {
      rendered: true,
      markVisible,
      needs: Math.round(needs),
      has: Math.round(span.getBoundingClientRect().width),
      control,
    };
  });
}

function assertWordmarkFits(m: Awaited<ReturnType<typeof measureWordmark>>, where: string) {
  expect(m.rendered, `${where}: wordmark not rendered`).toBe(true);
  expect(m.control, `${where}: the measurement harness itself is broken`).toBe('ok');
  expect(
    m.has,
    `${where}: wordmark truncated — needs ${m.needs}px, has ${m.has}px`
  ).toBeGreaterThanOrEqual(m.needs);
}

test.describe('header wordmark fits', () => {
  test('signed out', async ({ page }) => {
    for (const width of PHONE_WIDTHS) {
      await page.setViewportSize({ width, height: 812 });
      await page.goto('/sign-in');
      await page.getByTestId('credential-input').waitFor();
      assertWordmarkFits(await measureWordmark(page), `signed out @ ${width}`);
    }
  });

  for (const cartCount of [0, 3]) {
    test(`signed in — ${cartCount} cart items`, async ({ page }) => {
      // Fix the read-only badge response, not the shared account's real cart.
      // Its changing cart state used to decide whether CI exercised four controls.
      const isCartCount = (url: string) => {
        const request = new URL(url);
        return (
          request.pathname === '/rest/v1/entry_carts' &&
          request.searchParams.get('select') === 'id,entry_cart_items(count)'
        );
      };
      await page.route('**/rest/v1/entry_carts?*', async route => {
        if (!isCartCount(route.request().url())) return route.continue();
        await route.fulfill({
          json: [{ id: 'header-cart-fixture', entry_cart_items: [{ count: cartCount }] }],
        });
      });
      const countRead = page.waitForResponse(response => isCartCount(response.url()));
      await signInAsExhibitor(page, '/exhibitor/entries');
      await countRead;
      const header = page.locator('nav').filter({
        has: page.getByRole('link', { name: 'myK9Show home', exact: true }),
      });
      const cart = page.getByRole('button', { name: 'Shopping cart', exact: true });
      if (cartCount > 0) await expect(cart).toBeVisible();
      else await expect(cart).toBeHidden();

      for (const width of PHONE_WIDTHS) {
        await page.setViewportSize({ width, height: 812 });
        await expect(
          page.getByRole('button', { name: 'Open navigation', exact: true })
        ).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await expect
          .poll(
            async () => {
              const m = await measureWordmark(page);
              return m.has - m.needs;
            },
            { message: `signed in @ ${width}, cart ${cartCount}: wordmark must fit` }
          )
          .toBeGreaterThanOrEqual(0);
        assertWordmarkFits(await measureWordmark(page), `signed in @ ${width}, cart ${cartCount}`);
        for (const name of [
          'Open navigation',
          'Search',
          'Message Center',
          'Account menu',
          ...(cartCount > 0 ? ['Shopping cart'] : []),
        ]) {
          const bounds = await page
            .locator('nav')
            .getByRole('button', { name, exact: true })
            .boundingBox();
          expect(bounds, `${name} must be visible`).not.toBeNull();
          expect(bounds!.width, `${name} touch width`).toBeGreaterThanOrEqual(44);
          expect(bounds!.height, `${name} touch height`).toBeGreaterThanOrEqual(44);
          expect(bounds!.x, `${name} left edge`).toBeGreaterThanOrEqual(0);
          expect(bounds!.x + bounds!.width, `${name} right edge`).toBeLessThanOrEqual(width);
        }
        if (width === 360 && cartCount > 0) {
          await test.info().attach('header-360-with-cart', {
            body: await header.screenshot(),
            contentType: 'image/png',
          });
        }
      }
    });
  }

  test(`below ${NARROW_WIDTH + 40}px the mark carries the brand instead`, async ({ page }) => {
    await page.setViewportSize({ width: NARROW_WIDTH, height: 812 });
    await page.goto('/sign-in');
    await page.getByTestId('credential-input').waitFor();
    const m = await measureWordmark(page);
    expect(m.rendered, 'wordmark should be hidden, not truncated, below 360px').toBe(false);
    expect(m.markVisible, 'the brand mark must carry the brand where the name is hidden').toBe(
      true
    );
  });

  test('exactly one appearance control at every width', async ({ page }) => {
    await signInAsExhibitor(page, '/exhibitor/entries');
    for (const width of [375, 640, 768, 1024]) {
      await page.setViewportSize({ width, height: 812 });
      await page.waitForTimeout(300);

      const inHeader = await page.locator('nav [aria-label^="Switch to"]:visible').count();

      await page.getByRole('button', { name: 'Account menu' }).click();
      // Assert the menu actually opened. Counting inside a menu that never
      // rendered returns 0, which is indistinguishable from a missing item.
      await expect(page.getByRole('menuitem', { name: 'Account' })).toBeVisible();
      const inMenu = await page.getByRole('menuitem', { name: /light mode|dark mode/i }).count();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('menuitem', { name: 'Account' })).toBeHidden();

      expect(
        inHeader + inMenu,
        `@ ${width}px: expected exactly one way to change appearance, found ${inHeader} in the header and ${inMenu} in the account menu`
      ).toBe(1);
    }
  });
});
