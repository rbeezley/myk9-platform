import { expect, test } from '@playwright/test';
import { signInAsExhibitor } from './helpers/testUsers';

/**
 * MYK9-519 — "Enter a show" from Dog Details must carry that dog all the way
 * into the registration wizard's dog step.
 *
 * WHAT THIS SPEC IS. The real-browser half of the handoff contract that
 * `src/features/registration/entryDogContext.test.ts` and
 * `src/pages/RegistrationWizardPage/useEntryDogHandoff.test.tsx` pin in
 * isolation. Those prove the rules; this proves the three routes actually hand
 * the id to each other in a running app with a signed-in exhibitor, which no
 * unit test can see.
 *
 * It deliberately walks from `/dogs` rather than deep-linking, because the
 * thing under test is the chain, not any one page.
 */
/** Seeded show whose entry window is open; see docs/qa/e2e-suite-map.md. */
const OPEN_SHOW_NAME = 'Heartland Scent Work Classic';

test.describe('Dog Details -> show entry handoff', () => {
  test('carries the dog from Dog Details through browse into the wizard', async ({ page }) => {
    await signInAsExhibitor(page, '/dogs');

    // Open the first dog the exhibitor owns and remember which one it is.
    const firstDogLink = page.locator('a[href^="/dogs/"]').first();
    await expect(firstDogLink).toBeVisible({ timeout: 30_000 });
    await firstDogLink.click();
    await page.waitForURL(/\/dogs\/[^/?]+/, { timeout: 30_000 });
    const dogId = new URL(page.url()).pathname.split('/')[2];
    expect(dogId).toBeTruthy();

    // The identity rail's h1 is the call name, and the dog step labels its
    // checkbox `Select <call name>` — so this is what lets the last assertion
    // name the dog instead of settling for "something is checked".
    const callName = (await page.locator('[data-dog-identity] h1').innerText()).trim();
    expect(callName).not.toBe('');

    // The identity rail's primary action goes to the ordinary browse page,
    // carrying the dog rather than duplicating show-entry UI.
    const enterAShow = page.getByRole('link', { name: /enter a show/i });
    await expect(enterAShow).toBeVisible({ timeout: 30_000 });
    await enterAShow.click();
    await page.waitForURL(/\/shows\?/, { timeout: 30_000 });
    expect(new URL(page.url()).searchParams.get('dogId')).toBe(dogId);

    // Any browse hop must keep the context alive — here, the default card view.
    // Named rather than "the first card": most seeded shows have closed their
    // entry window, and a closed show offers no register action to hand off to.
    const showCard = page
      .locator(`a[href^="/shows/"][href*="dogId="][aria-label*="${OPEN_SHOW_NAME}"]`)
      .first();
    await expect(showCard).toBeVisible({ timeout: 30_000 });
    await showCard.click();
    await page.waitForURL(/\/shows\/[^/?]+\?/, { timeout: 30_000 });
    expect(new URL(page.url()).searchParams.get('dogId')).toBe(dogId);

    // The show-detail page hands it to the wizard on its own register action.
    // Labels differ by whether the exhibitor already holds entries here, and a
    // closed show offers none at all.
    const register = page
      .getByRole('button', { name: /enter this show|add classes|view entry/i })
      .first();
    // waitFor, not isVisible: `isVisible()` resolves immediately and ignores a
    // timeout option, so it reads a still-hydrating page as "no CTA" and skips.
    const canEnter = await register
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (!canEnter) {
      test.skip(true, `"${OPEN_SHOW_NAME}" is not accepting entries right now.`);
    }
    await register.click();
    await page.waitForURL(/\/shows\/[^/]+\/register/, { timeout: 30_000 });
    expect(new URL(page.url()).searchParams.get('dogId')).toBe(dogId);

    // ...and the dog step opens with THAT dog already chosen. Asserting the
    // named checkbox, not "a checked checkbox": the whole point of the issue is
    // that no other dog gets substituted, and a count check catches the
    // opposite failure of preselecting the roster.
    const chosen = page.getByRole('checkbox', { name: `Select ${callName}` });
    await expect(chosen).toBeChecked({ timeout: 30_000 });
    await expect(page.locator('[role="checkbox"][aria-checked="true"]')).toHaveCount(1);
  });

  test('falls back to normal selection for a dog the exhibitor does not own', async ({ page }) => {
    await signInAsExhibitor(page, '/dogs');
    const firstShowCard = page.locator('a[href^="/shows/"]').first();

    // Reach a show the ordinary way, then hand the wizard a stale id.
    await page.goto('/shows');
    await expect(firstShowCard).toBeVisible({ timeout: 30_000 });
    const showPath = await firstShowCard.getAttribute('href');
    const showId = showPath!.split('/')[2].split('?')[0];

    await page.goto(`/shows/${showId}/register?dogId=00000000-0000-4000-8000-000000000000`);

    // Never a silent substitution: nothing is selected, and the exhibitor is
    // told why before they start picking.
    await expect(page.getByText(/couldn't find that dog/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[role="checkbox"][aria-checked="true"]')).toHaveCount(0);
  });
});
