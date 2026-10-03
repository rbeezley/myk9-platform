import { expect, test } from '@playwright/test';
import { signInAsAdmin } from '../helpers/testUsers';

/**
 * MYK9-960: /admin/help and every /admin/permissions tab scrolled sideways at
 * a 375px phone (document scrollWidth 496 and 522). A wide table may scroll
 * inside its own container; the page itself must never scroll sideways.
 */
const PHONE = { width: 375, height: 900 } as const;
const DESKTOP = { width: 1280, height: 900 } as const;

const ROUTES = [
  { name: 'help', path: '/admin/help', ready: /Page Directory/ },
  { name: 'permissions overview', path: '/admin/permissions', ready: /Roles & Permissions/ },
  {
    name: 'permissions assignments',
    path: '/admin/permissions?tab=assignments',
    ready: /Assignments/,
  },
  {
    name: 'permissions inventory',
    path: '/admin/permissions?tab=permissions',
    ready: /Permission Inventory/,
  },
  { name: 'permissions audit', path: '/admin/permissions?tab=audit', ready: /Audit/ },
] as const;

test.describe('Admin Help and Permissions fit a phone', () => {
  test('page never scrolls sideways at 375px and desktop stays within its viewport', async ({
    page,
  }) => {
    // Ten full page loads (5 routes x 2 viewports) after one sign-in.
    test.setTimeout(180_000);
    await page.setViewportSize(PHONE);
    await signInAsAdmin(page, '/admin/help');

    for (const viewport of [PHONE, DESKTOP]) {
      await page.setViewportSize(viewport);
      for (const route of ROUTES) {
        await page.goto(route.path);
        await expect(page.getByText(route.ready).first()).toBeVisible();
        // Measure the loaded page, not its skeleton: the wide tables only
        // exist once the data has arrived.
        await page.waitForLoadState('networkidle');
        await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
        const widths = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          inner: window.innerWidth,
        }));
        test.info().annotations.push({
          type: 'scrollWidth',
          description: `${viewport.width}px ${route.name}: ${widths.scroll}`,
        });
        expect
          .soft(widths.scroll, `${route.name} at ${viewport.width}px`)
          .toBeLessThanOrEqual(widths.inner);
      }
    }
  });
});
