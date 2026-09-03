import { expect, test, type Page } from '@playwright/test';
import { TEST_USERS } from './helpers/testUsers';
import { signIn } from './uat/shared/auth';
import { LIVE_SECRETARY_SHOW_ID } from './uat/shared/seededShows';

const SEEDED_TRIAL_ID = 'dededede-0000-0000-0000-000000000021';
const SEEDED_CLASS_ID = 'dec1a55e-0000-0000-0000-000000000032';
const SEEDED_ENTRY_ID = 'dededede-0000-0000-0000-000000000053';

const VIEWPORTS = [
  { label: 'mobile', width: 375, height: 667 },
  { label: 'tablet', width: 768, height: 1024 },
  { label: 'desktop', width: 1280, height: 720 },
] as const;

const TARGET_TEXT = [
  'Back to Setup',
  'Manage Waitlist',
  'Add Classes',
  'Copy Link',
  'Open',
  'Approve all',
  'New result',
  'Result card',
  'Back to Show Desk',
  'Back to Entry List',
  'Results visibility',
  'Self check-in',
  'Enter this show',
  'Review details',
] as const;

interface RouteCheck {
  label: string;
  path: string;
}

const PUBLIC_ROUTES: RouteCheck[] = [{ label: 'prototype copy link', path: '/prototype/show' }];

const SECRETARY_ROUTES: RouteCheck[] = [
  {
    label: 'manage classes',
    path: `/shows/${LIVE_SECRETARY_SHOW_ID}/classes/${SEEDED_TRIAL_ID}`,
  },
  { label: 'results control', path: `/shows/${LIVE_SECRETARY_SHOW_ID}/results-control` },
  { label: 'show desk', path: `/shows/${LIVE_SECRETARY_SHOW_ID}/show-desk` },
  { label: 'ringside class list', path: `/at-show/${LIVE_SECRETARY_SHOW_ID}` },
];

const EXHIBITOR_ROUTES: RouteCheck[] = [{ label: 'my entries', path: '/exhibitor/entries' }];

async function waitForAppShell(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#root').waitFor({ state: 'attached', timeout: 15000 });
  await expect(page.locator('#root')).not.toBeEmpty({ timeout: 15000 });
  await expect(page.getByText('Loading page...')).toHaveCount(0, { timeout: 15000 });
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForTimeout(300);
}

async function measureResponsiveIntegrity(page: Page, targetText: readonly string[]) {
  return page.evaluate(targets => {
    const viewportWidth = window.innerWidth;
    const overflowPx = Math.max(0, document.documentElement.scrollWidth - viewportWidth);
    const overflowSources = Array.from(document.querySelectorAll('*'))
      .map(element => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className: String(element.className || '').slice(0, 120),
          text: (element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
        };
      })
      .filter(source => source.left < -1 || source.right > viewportWidth + 1)
      .slice(0, 5);

    const interactiveSelector =
      'button,a[href],[role="button"],[role="combobox"],[role="switch"],[role="checkbox"]';
    const badTargets = Array.from(document.querySelectorAll(interactiveSelector))
      .map(element => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const label = [
          element.getAttribute('aria-label'),
          element.getAttribute('title'),
          element.textContent,
        ]
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        return {
          label,
          tag: element.tagName.toLowerCase(),
          className: String(element.className || '').slice(0, 120),
          visible:
            style.visibility !== 'hidden' &&
            style.display !== 'none' &&
            rect.width > 0 &&
            rect.height > 0,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
        };
      })
      .filter(item => item.visible)
      .filter(item => targets.some(target => item.label.includes(target)))
      .filter(
        item =>
          item.width < 44 || item.height < 44 || item.left < -1 || item.right > viewportWidth + 1
      );

    return { overflowPx, overflowSources, badTargets };
  }, targetText);
}

async function checkRouteAtMatrix(page: Page, route: RouteCheck) {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(route.path, { waitUntil: 'commit' });
    await waitForAppShell(page);

    const result = await measureResponsiveIntegrity(page, TARGET_TEXT);
    expect(
      result.overflowPx,
      `${route.label}/${viewport.label}: horizontal overflow; sources=${JSON.stringify(
        result.overflowSources
      )}`
    ).toBe(0);
    expect(
      result.badTargets,
      `${route.label}/${viewport.label}: clipped or sub-44px named targets`
    ).toEqual([]);
  }
}

test.describe('shell integrity responsive runtime matrix', () => {
  test('public singleton routes pass overflow and target checks', async ({ page }) => {
    for (const route of PUBLIC_ROUTES) {
      await checkRouteAtMatrix(page, route);
    }
  });

  test('secretary singleton routes pass overflow and target checks', async ({ page }) => {
    const user = TEST_USERS.SECRETARY;
    if (!user.email || !user.password) {
      test.skip(true, 'Secretary credentials absent from environment');
    }

    await signIn(page, user.email, user.password, '/secretary/dashboard');
    for (const route of SECRETARY_ROUTES) {
      await checkRouteAtMatrix(page, route);
    }
  });

  test('ringside exit paths route staff back to canonical show-day surfaces', async ({ page }) => {
    const user = TEST_USERS.SECRETARY;
    if (!user.email || !user.password) {
      test.skip(true, 'Secretary credentials absent from environment');
    }

    await signIn(page, user.email, user.password, '/secretary/dashboard');

    await page.goto(`/at-show/${LIVE_SECRETARY_SHOW_ID}`, { waitUntil: 'commit' });
    await waitForAppShell(page);
    await page.getByRole('button', { name: 'Back to Show Desk' }).click();
    await expect(page).toHaveURL(new RegExp(`/shows/${LIVE_SECRETARY_SHOW_ID}/show-desk`));

    const scorePath = `/at-show/${LIVE_SECRETARY_SHOW_ID}/class/${SEEDED_CLASS_ID}/score/${SEEDED_ENTRY_ID}`;
    const classPath = `/at-show/${LIVE_SECRETARY_SHOW_ID}/class/${SEEDED_CLASS_ID}`;
    await page.goto(scorePath, { waitUntil: 'commit' });
    await waitForAppShell(page);
    await page.getByRole('button', { name: 'Back to Entry List' }).click();
    await expect(page).toHaveURL(new RegExp(classPath));
  });

  test('exhibitor My Entries passes overflow and target checks', async ({ page }) => {
    const user = TEST_USERS.DEMO_EXHIBITOR;
    if (!user.email || !user.password) {
      test.skip(true, 'Demo exhibitor credentials absent from environment');
    }

    await signIn(page, user.email, user.password, '/exhibitor/entries');
    for (const route of EXHIBITOR_ROUTES) {
      await checkRouteAtMatrix(page, route);
    }
  });

  test('exhibitor My Entries exposes filters before the balance card at 375px', async ({
    page,
  }) => {
    const user = TEST_USERS.DEMO_EXHIBITOR;
    if (!user.email || !user.password) {
      test.skip(true, 'Demo exhibitor credentials absent from environment');
    }

    await signIn(page, user.email, user.password, '/exhibitor/entries');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/exhibitor/entries', { waitUntil: 'commit' });
    await waitForAppShell(page);

    const filters = page.getByTestId('entry-filter-strip');
    const balance = page.getByTestId('entry-fee-balance');
    await expect(filters).toBeVisible();
    await expect(balance).toBeVisible();

    const layout = await page.evaluate(() => {
      const filterStrip = document.querySelector('[data-testid="entry-filter-strip"]');
      const feeBalance = document.querySelector('[data-testid="entry-fee-balance"]');
      if (!filterStrip || !feeBalance) return null;
      const filterRect = filterStrip.getBoundingClientRect();
      const balanceRect = feeBalance.getBoundingClientRect();
      return {
        filterTop: filterRect.top,
        balanceTop: balanceRect.top,
        viewportHeight: window.innerHeight,
      };
    });

    expect(layout).not.toBeNull();
    expect(layout?.filterTop, 'filters should follow the hero context').toBeLessThan(
      layout?.balanceTop ?? 0
    );
    expect(
      layout?.filterTop,
      'filters should be usable in the initial phone viewport'
    ).toBeLessThan(layout?.viewportHeight ?? 0);
  });
});
