import { expect, test, type Page } from '@playwright/test';
import { signInAsExhibitor } from '../helpers/testUsers';
import { installSharedStagingWriteGuard } from '../helpers/sharedStagingWriteGuard';
import { chooseAction } from '../helpers/actionsMenu';

/**
 * Suite category: feature-audit.
 *
 * MYK9-1124: a dog edit made offline, refused by the server, then Discarded
 * while still offline must show the restored value on the dog page, the dogs
 * list and the owner's dogs (My Entries), with no reconnect after the Discard.
 *
 * The dog write never reaches shared staging: the PATCH to /rest/v1/dogs is
 * answered locally with a 4xx refusal (never `route.continue()`), and the
 * shared-staging write guard blocks any other write.
 */

const EDITED_NAME = 'Offline Edit Refused';

interface DogsPatch {
  url: string;
  body: Record<string, unknown>;
}

async function setNetwork(page: Page, offline: boolean) {
  await page.context().setOffline(offline);
  await page.evaluate(
    name => window.dispatchEvent(new Event(name)),
    offline ? 'offline' : 'online'
  );
}

test.describe('Dog offline Discard (MYK9-1124)', () => {
  test('Discard of a refused offline dog edit restores the dog on every dog screen', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const patches: DogsPatch[] = [];
    let refusals = 0;

    await installSharedStagingWriteGuard(page);
    // Registered after the guard, so it wins: the dog write is answered here
    // and never forwarded.
    await page.route('**/rest/v1/dogs**', async route => {
      const request = route.request();
      if (request.method() !== 'PATCH') {
        await route.fallback();
        return;
      }
      patches.push({
        url: request.url(),
        body: (request.postDataJSON() ?? {}) as Record<string, unknown>,
      });
      refusals += 1;
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          code: '23514',
          details: null,
          hint: null,
          message: 'new row for relation "dogs" violates check constraint (e2e refusal)',
        }),
      });
    });

    await signInAsExhibitor(page, '/dogs');
    await expect(page.getByRole('heading', { name: 'My Dogs', level: 1 })).toBeVisible({
      timeout: 30_000,
    });

    const firstDogLink = page.locator('a[href^="/dogs/"]').first();
    await expect(firstDogLink).toBeVisible({ timeout: 30_000 });
    const href = (await firstDogLink.getAttribute('href')) ?? '';
    const dogId = href.split('/').pop() ?? '';
    expect(dogId).toMatch(/^[0-9a-f-]{36}$/);

    // Cache the dog page, the dogs list and the owner's dogs.
    await page.goto(`/dogs/${dogId}`);
    const title = page.locator('h1[tabindex="-1"]');
    await expect(title).toBeVisible({ timeout: 30_000 });
    const originalName = ((await title.innerText()) ?? '').trim();
    expect(originalName.length).toBeGreaterThan(0);
    console.log(`[1124] dog page heading before edit: ${JSON.stringify(originalName)}`);

    // Visit the other two screens in-app so their reads are cached too.
    await goToList(page);
    await expect(page.getByText(originalName).first()).toBeVisible({ timeout: 30_000 });
    await goToMyEntries(page);
    await expect(page.getByText(originalName).first()).toBeVisible({ timeout: 30_000 });
    await goToList(page);
    await page.locator(`a[href="/dogs/${dogId}"]`).first().click();
    await expect(title).toHaveText(originalName);

    // Offline: edit the call name and queue the save.
    await setNetwork(page, true);
    await chooseAction(page, 'Edit dog');
    await expect(page.getByRole('heading', { name: 'Edit Dog' })).toBeVisible();
    await page.locator('input#callName').fill(EDITED_NAME);
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByRole('heading', { name: 'Edit Dog' })).not.toBeVisible();
    await expect(title).toHaveText(EDITED_NAME);
    expect(patches).toHaveLength(0);
    // Positive control: the queued edit is on the other two screens, so their
    // "no edited name" assertions after Discard can actually fail.
    await goToList(page);
    await expect(page.getByText(EDITED_NAME).first()).toBeVisible({ timeout: 30_000 });
    await goToMyEntries(page);
    await expect(page.getByText(EDITED_NAME).first()).toBeVisible({ timeout: 30_000 });
    await goToList(page);
    await page.locator(`a[href="/dogs/${dogId}"]`).first().click();
    await expect(title).toHaveText(EDITED_NAME);

    // Reconnect only long enough for the queued write to be attempted and
    // refused, then drop the network again while the failure toast is up.
    await setNetwork(page, false);
    await expect.poll(() => refusals, { timeout: 60_000 }).toBeGreaterThan(0);
    const discard = page.getByRole('button', { name: 'Discard', exact: true });
    await expect(discard).toBeVisible({ timeout: 30_000 });
    await setNetwork(page, true);
    await discard.click();

    // Offline, no reconnect: the restored value is on every dog screen.
    await expect(title).toHaveText(originalName, { timeout: 30_000 });
    await goToList(page);
    await expect(page.getByText(originalName).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(EDITED_NAME)).toHaveCount(0);
    // A failed read is never shown as "no dogs": the offline list still has rows.
    expect(await page.locator('a[href^="/dogs/"]').count()).toBeGreaterThan(0);
    await goToMyEntries(page);
    await expect(page.getByText(originalName).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(EDITED_NAME)).toHaveCount(0);

    // Every PATCH was answered locally by the route above.
    expect(patches.length).toBe(refusals);
    expect(patches.some(patch => patch.body.call_name === EDITED_NAME)).toBe(true);
  });
});

async function goToList(page: Page) {
  await page
    .getByRole('link', { name: /^(My )?Dogs$/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'My Dogs', level: 1 })).toBeVisible();
}

async function goToMyEntries(page: Page) {
  await page
    .getByRole('link', { name: /^My Shows/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/exhibitor\/entries/);
}
