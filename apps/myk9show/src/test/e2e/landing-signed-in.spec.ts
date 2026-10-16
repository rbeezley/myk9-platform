import { expect, test } from '@playwright/test';
import { expectHeaderFits, expectNoLandingSpills } from './helpers/landingGeometry';
import { signInAsSecretary, TEST_USERS } from './helpers/testUsers';

// Signed-in visitors to the landing page: `/` sends them to their dashboard, and the
// club-onboarding return path (`/?onboarding=true#get-started`, built by ClubOnboarding
// for sign-in and sign-up) shows the landing with exactly one landing header, pinned
// under the app header, and the club form in view with the account email filled in.
test.describe('landing for a signed-in secretary', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('/ redirects to the dashboard', async ({ page }) => {
    await signInAsSecretary(page, '/');
    await page.goto('/');
    await expect(page).not.toHaveURL(/\/$/, { timeout: 15000 });
    await expect(page.locator('.landing-v2')).toHaveCount(0);
  });

  test('the onboarding return shows one header under the app header and the club form', async ({
    page,
  }) => {
    await signInAsSecretary(page, '/');
    await page.goto('/?onboarding=true#get-started');

    const landing = page.locator('.landing-v2');
    await expect(landing).toHaveAttribute('data-guest', 'false');
    await expect(landing.locator('.l-hdr')).toHaveCount(1);
    await expect(landing.locator('.l-hdr').getByRole('link', { name: /sign in/i })).toHaveCount(0);

    const form = page.locator('#get-started');
    await expect(form).toBeInViewport({ timeout: 10000 });
    await expect(page.locator('#onb-contact-email')).toHaveValue(TEST_USERS.SECRETARY.email);

    // Scroll so the sticky landing header pins, then check it sits below the app header.
    await page.mouse.wheel(0, 400);
    await expect
      .poll(() =>
        page.evaluate(() => {
          // AppHeader renders a fixed <nav> above the landing.
          const appHeader = document.querySelector('nav.fixed');
          const landingHeader = document.querySelector('.landing-v2 .l-hdr');
          if (!appHeader || !landingHeader) return null;
          return (
            landingHeader.getBoundingClientRect().top - appHeader.getBoundingClientRect().bottom
          );
        })
      )
      .toBeGreaterThanOrEqual(-1);
  });

  // Signed in, the landing renders under the app header (no sidebar: `/` sits outside
  // UnifiedAppLayout) and the landing header drops Sign in. Nothing may spill at tablet
  // widths, in either audience.
  test('nothing spills on a signed-in tablet', async ({ page }) => {
    await signInAsSecretary(page, '/');
    for (const width of [768, 1024]) {
      await page.setViewportSize({ width, height: 1024 });
      await page.goto('/?onboarding=true');
      await expect(page.locator('#showday-dot')).toBeAttached({ timeout: 30000 });
      await expect(page.locator('.landing-v2')).toHaveAttribute('data-guest', 'false');
      await expectHeaderFits(page);
      for (const audience of ['club', 'exhibitor']) {
        if (audience === 'exhibitor') {
          await page.getByRole('button', { name: /entering a show/i }).click();
        }
        await expectNoLandingSpills(page, `${width}px signed in, ${audience}`);
      }
    }
  });
});
