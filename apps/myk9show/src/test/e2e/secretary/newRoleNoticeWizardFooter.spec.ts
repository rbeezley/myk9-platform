import { expect, test, type Page, type Route } from '@playwright/test';
import { signInAsSecretary } from '../uat/shared/auth';

/**
 * MYK9-1131 — the "You're now a show secretary" notice (MYK9-970) must never
 * cover the show wizard's Next. It was `position: fixed` at the viewport
 * bottom, and Next is the last control on the page, so for a newly promoted
 * secretary no scroll position uncovered it: three Nightly tests reported Next
 * as never clickable. #2935 hid that by seeding onboarded_roles; a real new
 * secretary still hit it.
 *
 * This spec recreates the new secretary WITHOUT touching the database: it
 * rewrites the profile read so onboarded_roles is empty, which is exactly the
 * state the notice is built from. It measures real geometry (jsdom has no
 * layout engine) and asserts the notice is on screen when it measures, so it
 * cannot pass by the notice being absent.
 *
 * Read-only: Next on an empty Step 1 only surfaces validation; nothing is
 * saved, and the notice is never dismissed (which would write onboarded_roles).
 * Secretary-authed, so it runs in the Nightly regression list.
 */

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
];

/** Serve the signed-in person's real profile, minus every finished role step. */
async function asNewlyPromoted(route: Route) {
  if (route.request().method() !== 'GET') return route.continue();
  const response = await route.fetch();
  const body: unknown = await response.json();
  const clear = (row: unknown) =>
    row && typeof row === 'object' ? { ...row, onboarded_roles: [] } : row;
  const json = Array.isArray(body) ? body.map(clear) : clear(body);
  return route.fulfill({ response, json });
}

function intersects(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

async function scrollToPageEnd(page: Page) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  // Two frames: let sticky positioning settle after the scroll.
  await page.evaluate(
    () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  );
}

for (const viewport of VIEWPORTS) {
  test(`new-role notice leaves the wizard's Next clickable @ ${viewport.width}px`, async ({
    page,
  }) => {
    // Sign-in plus a cold dev-server compile can eat most of the default 30s.
    test.setTimeout(90000);
    await page.setViewportSize(viewport);
    await page.route('**/rest/v1/exhibitor_profiles*', asNewlyPromoted);
    await signInAsSecretary(page, '/secretary/create-show/wizard');
    await expect(page.getByRole('heading', { name: 'Basics' })).toBeVisible({ timeout: 15000 });

    // Positive control: the notice is really there.
    const notice = page.getByTestId('new-role-step-banner');
    await expect(notice).toBeVisible({ timeout: 15000 });
    await expect(notice).toContainText(/You're now a/);

    const next = page.getByRole('button', { name: /^Next$/ });
    await expect(next).toBeVisible();
    await scrollToPageEnd(page);

    const noticeBox = await notice.boundingBox();
    const nextBox = await next.boundingBox();
    expect(noticeBox, 'notice must be rendered').not.toBeNull();
    expect(nextBox, 'Next must be rendered').not.toBeNull();
    // Still on screen at the end of the page, not merely in the DOM.
    expect(noticeBox!.y + noticeBox!.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(nextBox!.y + nextBox!.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(
      intersects(noticeBox!, nextBox!),
      `notice ${JSON.stringify(noticeBox)} overlaps Next ${JSON.stringify(nextBox)}`
    ).toBe(false);

    // A real click, no force: Playwright's hit test fails if anything covers Next.
    await next.click({ timeout: 5000 });
    await expect(page.getByRole('alert')).toContainText(/\d+ items? needs? attention/i);
    // The notice is untouched by advancing: still shown once, not dismissed.
    await expect(notice).toBeVisible();
  });
}
