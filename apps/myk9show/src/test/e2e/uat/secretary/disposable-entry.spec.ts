import { expect, test, type Locator } from '@playwright/test';
import { signInAsSecretary } from '../shared/auth';
import {
  createBrowserHealth,
  summarizeHealth,
  watchBrowserHealth,
  writeUatFinding,
  type BrowserHealth,
} from '../shared/artifacts';
import {
  cleanupSecretaryEntry,
  readSecretaryEntryState,
  seedSecretaryEntry,
  type SecretaryUatSeed,
} from '../shared/secretaryData';

test.describe.configure({ mode: 'serial' });

const healthByTest = new Map<string, BrowserHealth>();
const seedByTest = new Map<string, SecretaryUatSeed>();

interface ObservedRingsideResponse {
  status: number;
  body: string;
  request: unknown;
}

test.describe('Phase 1 UAT - Secretary disposable entry management', () => {
  test.setTimeout(90000);

  test.beforeEach(async ({ page }, testInfo) => {
    const health = createBrowserHealth();
    healthByTest.set(testInfo.testId, health);
    watchBrowserHealth(page, health);

    const seed = await seedSecretaryEntry(testInfo);
    seedByTest.set(testInfo.testId, seed);
    await signInAsSecretary(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    void page;
    const seed = seedByTest.get(testInfo.testId) ?? null;
    await cleanupSecretaryEntry(testInfo, seed);

    const health = healthByTest.get(testInfo.testId) ?? createBrowserHealth();
    const details = summarizeHealth(health);
    const status = testInfo.status === testInfo.expectedStatus ? 'passed' : 'failed';
    await writeUatFinding(testInfo, 'Secretary', 'disposable entry management', status, details);

    healthByTest.delete(testInfo.testId);
    seedByTest.delete(testInfo.testId);
  });

  test('secretary can find, assign armband, accept, and check in a disposable entry', async ({
    page,
  }, testInfo) => {
    const seed = seedByTest.get(testInfo.testId)!;
    const ringsideResponses: ObservedRingsideResponse[] = [];
    page.on('response', response => {
      if (new URL(response.url()).pathname !== '/rest/v1/rpc/ringside_update_entry') return;
      const observed: ObservedRingsideResponse = {
        status: response.status(),
        body: '<pending>',
        request: response.request().postData(),
      };
      ringsideResponses.push(observed);
      void response
        .text()
        .then(body => {
          observed.body = body;
          observed.request = response.request().postDataJSON();
        })
        .catch(error => {
          observed.body = error instanceof Error ? error.message : String(error);
        });
    });

    await page.goto(`/shows/${seed.showId}/entry-management`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Entry Management' })).toBeVisible({
      timeout: 15000,
    });

    await page.getByRole('searchbox', { name: 'Search all show registrations' }).fill(seed.dogName);
    const registrationRow = page
      .getByRole('list', { name: 'Registration work queue' })
      .getByRole('listitem')
      .filter({ hasText: seed.dogName });
    await expect(registrationRow).toBeVisible({ timeout: 10000 });
    await registrationRow.click();

    const entryCard = page
      .locator('section[aria-label^="Focused registration for"]')
      .filter({ hasText: seed.dogName });
    await expect(entryCard).toContainText(seed.className, { timeout: 10000 });

    await openArmbandDialog(entryCard, seed.dogName);
    const armbandDialog = page.getByRole('dialog', { name: 'Assign Armband' });
    await expect(armbandDialog).toBeVisible();
    await armbandDialog.getByLabel('Armband Number').fill(seed.armband);
    await armbandDialog.getByRole('button', { name: 'Assign' }).click();
    await expect(armbandDialog).not.toBeVisible({ timeout: 10000 });
    await expect(entryCard.getByText(seed.armband).first()).toBeVisible();

    // Case-INSENSITIVE on purpose. EntryStatusPopover's accessible name is
    // `${visibleStatusLabel}, change entry status for <dog> in <class>` — the
    // verb is lower-case because it follows the status label. A capitalised
    // "Change" without the `i` flag matches nothing, which is why this line
    // failed after the armband fix let the test reach it. Every sibling gets
    // this right: postPaymentLifecycle.spec.ts and both unit tests use /i.
    const entryStatusButton = entryCard.getByRole('button', {
      name: new RegExp(
        `change entry status for ${escapeRegExp(seed.dogName)} in ${escapeRegExp(seed.className)}`,
        'i'
      ),
    });
    await expect(entryStatusButton).toBeVisible({ timeout: 10000 });
    await entryCard.getByRole('button', { name: 'Accept', exact: true }).click();
    await expect(entryStatusButton).toContainText('Accepted', { timeout: 10000 });
    await expect
      .poll(() => readSecretaryEntryState(seed.entryId), { timeout: 20_000 })
      .toMatchObject({ entry_status: 'confirmed' });

    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('link', { name: 'Open Check-in desk' }).click();
    await expect(page).toHaveURL(
      new RegExp(`/shows/${seed.showId}/show-desk\\?tool=people-at-show`)
    );

    const toolsDialog = page.getByRole('dialog', { name: 'Show Desk tools' });
    await expect(toolsDialog).toBeVisible();
    await page.getByRole('textbox', { name: 'Search exhibitors' }).fill(seed.dogName);

    const personRow = page.getByRole('button').filter({ hasText: seed.dogName });
    await expect(personRow).toHaveCount(1);
    await personRow.click();

    const classRow = page.getByText(seed.dogName, { exact: true }).locator('..').locator('..');
    await expect(classRow.getByText(seed.armband, { exact: true })).toBeVisible();
    await classRow.getByRole('button', { name: 'Check in', exact: true }).click();
    await expect(classRow.getByText('Checked-in', { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expect.poll(() => ringsideResponses.length, { timeout: 20_000 }).toBeGreaterThan(0);
    await expect
      .poll(() => ringsideResponses.every(response => response.body !== '<pending>'), {
        timeout: 5_000,
      })
      .toBe(true);
    const failedRingsideResponse = ringsideResponses.find(response => response.status >= 400);
    if (failedRingsideResponse) {
      throw new Error(`Check-in RPC failed: ${JSON.stringify(failedRingsideResponse, null, 2)}`);
    }
    await expect
      .poll(() => readSecretaryEntryState(seed.entryId), { timeout: 20_000 })
      .toMatchObject({ entry_status: 'confirmed', check_in_status: 'checked-in' });
  });
});

/**
 * Open the armband dialog from the FOCUSED entry card.
 *
 * Both of this helper's old locators addressed names the app no longer emits,
 * and neither could ever have matched:
 *
 * - `button[name="Assign", exact]` — the control's visible text is "Assign",
 *   but its accessible name comes from `aria-label={`Assign armband to
 *   ${dogName}`}` (EntryListCard), so an exact match on "Assign" fails. The
 *   assigned variant reads `"<n>, change armband for <dog>"`.
 * - `button[name="Actions", exact]` — RowActionMenu's trigger is labelled
 *   "Actions for <dog>" (default "Row actions"), never bare "Actions".
 *
 * A WCAG 2.5.3 accessible-name change broke this and nothing noticed, because
 * Playwright Regression had never executed a test (MYK9-271).
 *
 * Scoped to the card rather than the page: the old page-wide `.first()`/
 * `.last()` could pick up a control from another region entirely, which turns
 * a missing affordance into an unrelated click.
 */
async function openArmbandDialog(entryCard: Locator, dogName: string) {
  const armbandButton = entryCard.getByRole('button', {
    name: new RegExp(
      `(assign armband to ${escapeRegExp(dogName)}|change armband for ${escapeRegExp(dogName)})`,
      'i'
    ),
  });
  await expect(armbandButton).toBeVisible({ timeout: 10000 });
  await armbandButton.click();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
