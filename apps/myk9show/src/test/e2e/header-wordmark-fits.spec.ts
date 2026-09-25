import { test, expect, type Locator, type Page } from '@playwright/test';
import { signInAsExhibitor, signInAsSecretary } from './helpers/testUsers';
import { installExhibitorFixture } from './helpers/exhibitorFixture';
import { RECOVERABLE_CART_LOOKUP_SELECT_PARAM } from '@/store/cartStore.pickCart.constants';

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

// Where the secretary case measures the header Actions button. The exhibitor
// cases above are BLIND to it (MYK9-630): it never renders on
// `/exhibitor/entries`, so the labelled trigger shipped having squeezed the
// wordmark to "myK9S..." at every phone width with nothing red.
//
// A GLOBAL route, not a show. For a secretary the button renders here from
// role alone ("Add Show", "Open Show Management"), and the trigger is the
// same component at the same width on every route. This case used to open the
// seeded show `dededede-…0010`; when staging was emptied on 2026-09-20 that
// show vanished, the page fell to "We couldn't load this show", the button
// withdrew, and a header-geometry spec went red over missing data
// (docs/plan-hermetic-e2e-fixtures.md).
const SECRETARY_ROUTE = '/secretary/dashboard';

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

/**
 * Resolve once the Actions trigger has reported the same width twice running,
 * i.e. the header has stopped reflowing.
 */
async function waitForSettledTriggerWidth(trigger: Locator, viewportWidth: number) {
  let previous = -1;
  await expect
    .poll(
      async () => {
        const box = await trigger.boundingBox();
        const current = box ? Math.round(box.width) : -1;
        const settled = current > 0 && current === previous;
        previous = current;
        return settled;
      },
      {
        intervals: [250, 250, 250, 250, 250, 250, 500, 500],
        timeout: 10000,
        message: `@ ${viewportWidth}px: the header never stopped reflowing`,
      }
    )
    .toBe(true);
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
      const toggle = page.getByRole('button', { name: /^Switch to (light|dark) mode$/ });
      const bounds = await toggle.boundingBox();
      expect(bounds, `signed out @ ${width}: theme toggle must be visible`).not.toBeNull();
      expect(bounds!.width).toBeGreaterThanOrEqual(44);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('guest theme choice carries from sign-in to sign-up and reload', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/sign-in');
    await page.getByTestId('credential-input').waitFor();

    const darkButton = page.getByRole('button', { name: 'Switch to dark mode' });
    const lightButton = page.getByRole('button', { name: 'Switch to light mode' });
    if (await lightButton.isVisible()) await lightButton.click();
    await darkButton.click();
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    const bootTheme = await page.evaluate(() => {
      const stored = localStorage.getItem('myK9Q_settings');
      return stored ? JSON.parse(stored).state.settings.theme : null;
    });
    expect(bootTheme).toBe('dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);

    await page.goto('/sign-up');
    await expect(lightButton).toBeVisible();
    await page.reload();
    await expect(lightButton).toBeVisible();
    await lightButton.click();
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
  });

  test('guest theme choice remains after account sign-in', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByTestId('credential-input').waitFor();

    const lightButton = page.getByRole('button', { name: 'Switch to light mode' });
    if (await lightButton.isVisible()) await lightButton.click();
    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);

    // The fixture stops the /onboarding redirect; see exhibitorFixture.ts.
    await installExhibitorFixture(page);
    await signInAsExhibitor(page, '/exhibitor/entries');

    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  });

  for (const cartCount of [0, 3]) {
    test(`signed in — ${cartCount} cart items`, async ({ page }) => {
      // Fix the read-only badge response, not the shared account's real cart.
      // Its changing cart state used to decide whether CI exercised four controls.
      // The badge reads through the shared recoverable-cart lookup (MYK9-650), so
      // match its exact select and answer with the full row shape it picks from.
      const isCartCount = (url: string) => {
        const request = new URL(url);
        return (
          request.pathname === '/rest/v1/entry_carts' &&
          request.searchParams.get('select') === RECOVERABLE_CART_LOOKUP_SELECT_PARAM
        );
      };
      await page.route('**/rest/v1/entry_carts?*', async route => {
        if (!isCartCount(route.request().url())) return route.continue();
        await route.fulfill({
          json: [
            {
              id: 'header-cart-fixture',
              show_id: '00000000-0000-4000-8000-00000000c0a7',
              status: 'active',
              expires_at: null,
              created_at: '2026-09-01T00:00:00.000Z',
              entry_cart_items: [{ count: cartCount }],
            },
          ],
        });
      });
      await installExhibitorFixture(page);
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

  test('signed in as a secretary — the Actions button must not squeeze the wordmark', async ({
    page,
  }) => {
    await signInAsSecretary(page, SECRETARY_ROUTE);

    const trigger = page.getByTestId('header-actions-trigger');
    // Positive control: without this the whole test passes on a page where the
    // button never rendered, which is exactly how the bug got through.
    await expect(trigger, 'a secretary must get the Actions button from role alone').toBeVisible();

    for (const width of PHONE_WIDTHS) {
      await page.setViewportSize({ width, height: 812 });
      await page.evaluate(() => document.fonts.ready);
      // The header keeps reflowing for about a second after a viewport change:
      // the hamburger appears, the roles resolve and the Actions button
      // takes its final width. Measured before that settles, the wordmark
      // reports its FULL width and the truncation never shows -- on the pre-fix
      // build an unsettled read gave 105/114/114 where the settled one gives
      // 69/84/87. So wait for two agreeing widths and then assert once. Never
      // `expect.poll` toward "it fits": that passes on the first frame, and so
      // passes on the very regression it is there to catch.
      await waitForSettledTriggerWidth(trigger, width);
      assertWordmarkFits(await measureWordmark(page), `secretary @ ${width}`);

      const bounds = await trigger.boundingBox();
      expect(bounds, `Actions trigger @ ${width}`).not.toBeNull();
      expect(bounds!.width, `Actions touch width @ ${width}`).toBeGreaterThanOrEqual(44);
      expect(bounds!.height, `Actions touch height @ ${width}`).toBeGreaterThanOrEqual(44);
      expect(bounds!.x, `Actions left edge @ ${width}`).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width, `Actions right edge @ ${width}`).toBeLessThanOrEqual(width);
      // Icon-only below `sm`, measured as WIDTH rather than as text: an
      // `sr-only` label is still in the DOM and still in `innerText`.
      expect(
        bounds!.width,
        `@ ${width}px the trigger must be icon-only — a written label costs the wordmark 45px it does not have`
      ).toBeLessThanOrEqual(56);

      if (width === 375) {
        await test.info().attach('header-375-secretary-actions', {
          body: await page.locator('nav').first().screenshot(),
          contentType: 'image/png',
        });
      }
    }

    // From `sm` up the written label comes back, where the header has the room.
    await page.setViewportSize({ width: 1280, height: 900 });
    // Poll the WIDTH. `toHaveText(/Actions/)` is not a sync point here: the
    // icon-only trigger already carries "Actions" as its `sr-only` label, so it
    // matched before the media query flipped and the box read 44px (CI config,
    // 2026-09-23). Polling toward "labelled" is safe in this direction -- the
    // regression it guards is a label that never comes back, which still times
    // out red.
    await expect
      .poll(async () => (await trigger.boundingBox())?.width ?? 0, {
        message: 'the labelled desktop trigger is wider than the icon',
      })
      .toBeGreaterThan(56);
    assertWordmarkFits(await measureWordmark(page), 'secretary @ 1280');
    await test.info().attach('header-desktop-secretary-actions', {
      body: await page.locator('nav').first().screenshot(),
      contentType: 'image/png',
    });
  });

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
    await installExhibitorFixture(page);
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
