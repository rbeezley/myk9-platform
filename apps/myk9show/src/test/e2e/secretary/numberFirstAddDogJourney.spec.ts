import { expect, test, type Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DATA_REQUIRED } from '../helpers/liveCanary';
import { uniqueRegistrationNumber } from '../helpers/addDogRegistration';
import { expectNoHorizontalOverflow } from '../helpers/horizontalOverflow';
import { installSharedStagingWriteGuard } from '../helpers/sharedStagingWriteGuard';
import { signInAsExhibitor, signInAsSecretary, TEST_USERS } from '../helpers/testUsers';
import { installBrowserDiagnostics } from '../shared/browserDiagnostics';
import { clickClearOfStickyChrome } from '../registration/wizardChips';
import {
  akcNumberOf,
  CLASS_ID,
  COOPER_ID,
  createForeignDog,
  createJourneyExhibitor,
  personByEmail,
  removeDogsNamed,
  removeJourneyExhibitor,
  SEEDED_RUN_SHEET_DOG,
  SHOW_ID,
  TRIAL_ID,
} from './numberFirstAddDogFixture';
import { waitlistAdmin } from './waitlistJourneyFixture';
import { chooseAction } from '../helpers/actionsMenu';

/**
 * Suite category: nightly (stateful, seeded Playwright Regression only).
 *
 * MYK9-1162 integration journeys for number-first Add Dog and the held "Registration number
 * needed" entry. Both write, so both `test.skip` unless MYK9_PLAYWRIGHT_REGRESSION_ENABLED=true,
 * which only the isolated Supabase target sets (`scripts/qa/run-playwright-regression.sh`). The
 * shared-staging write guard stays installed as a second net, and service-role setup refuses any
 * Supabase host that is not on this machine (`waitlistAdmin`).
 *
 * Secretary, on the seed's open-entry show (Heartland Scent Work Classic, `...010`):
 *   Add Dog asks registry + number first -> Cooper's seeded AKC number finds the existing dog
 *   -> Use existing dog -> the entry wizard's Create New > Dog Only adds a dog through "No
 *   registration number yet" -> the dog is entered in Interior Novice B -> it is listed under
 *   Registration number needed and is NOT on that class's run sheet -> Add registration -> the
 *   row leaves the list and the dog appears on the run sheet.
 *
 * Exhibitor at 390px: an AKC number held by a dog the exhibitor cannot see shows only the
 * "already registered" message, with no other detail about the dog.
 *
 * Cleanup: the secretary journey files its entry under an exhibitor it creates, so the enrollment
 * and payment rows are its own; `afterAll` removes them with the dogs, entries, armbands and
 * registrations. The isolated target is also reset between the two Nightly passes. Seeded rows
 * are only read, never changed.
 */

const TAKEN_MESSAGE =
  'This number is already registered to another dog. Contact the show secretary.';
const PHONE = { width: 390, height: 844 } as const;
const AKC_OPTION = /AKC \(American Kennel Club\)/i;

/** Letters and digits only, and unique per run. */
function uniqueCallName(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}`;
}

/** Add Dog's Registration step: pick the registry, type the number, press Find dog. */
async function findDogByNumber(page: Page, number: string) {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await dialog.locator('#organization').click();
  await page.getByRole('option', { name: AKC_OPTION }).click();
  await dialog.getByLabel(/Registration Number/i).fill(number);
  await dialog.getByRole('button', { name: 'Find dog' }).click();
  return dialog;
}

async function openAddDogFromDogsPage(page: Page) {
  await chooseAction(page, 'Add Dog');
}

test.describe('Number-first Add Dog: a held entry is listed, kept off the run sheet, released by its number', () => {
  installBrowserDiagnostics(test);
  test.skip(
    !DATA_REQUIRED,
    'Stateful: adds a dog and an entry, then a registration. ' +
      'Runs only on the seeded isolated Playwright Regression target.'
  );
  test.describe.configure({ mode: 'serial' });

  let admin: SupabaseClient;
  const heldDog = uniqueCallName('Held');
  let owner: { id: string; fullName: string } | undefined;

  test.beforeAll(async () => {
    admin = waitlistAdmin();
    // Created before sign-in, so the secretary's people list has them on first load.
    owner = await createJourneyExhibitor(admin, Date.now().toString(36));
  });

  test.afterAll(async () => {
    if (admin && owner) await removeJourneyExhibitor(admin, owner.id, [heldDog]);
  });

  test('a secretary finds an existing dog by its number, then enters a no-number dog that is held until its number is added (MYK9-1162)', async ({
    page,
  }) => {
    test.setTimeout(420_000);
    await installSharedStagingWriteGuard(page, { strictRpcWrites: true });
    // The wizard emails the exhibitor a confirmation; nothing here should send one.
    await page.route('**/functions/v1/send-registration-email', route =>
      route.fulfill({
        status: 200,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'POST, OPTIONS',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ ok: true }),
      })
    );

    const cooperNumber = await akcNumberOf(admin, COOPER_ID);
    if (!owner) throw new Error('The journey exhibitor was not created');
    const journeyOwner = owner;
    const heldRegistration = uniqueRegistrationNumber('HELD');
    const row = () =>
      page.getByRole('listitem').filter({ has: page.getByText(heldDog, { exact: true }) });
    const runSheetUrl = `/shows/${SHOW_ID}/trials/${TRIAL_ID}/classes/${CLASS_ID}`;
    const registrationNeededUrl = `/shows/${SHOW_ID}/entries?tab=exceptions&exception=registration-needed`;

    await test.step('1. Add Dog asks for the number first and finds the existing dog', async () => {
      await signInAsSecretary(page, '/dogs');
      // Cooper is on this device before the lookup runs, or "Find dog" would ask the server.
      await expect(page.getByRole('link', { name: /Cooper/ }).first()).toBeVisible({
        timeout: 45_000,
      });
      await openAddDogFromDogsPage(page);
      const dialog = await findDogByNumber(page, cooperNumber);
      await expect(dialog.getByText(/This looks like Cooper/)).toBeVisible({ timeout: 30_000 });
      await dialog.getByRole('button', { name: 'Use existing dog' }).click();
      await expect(page).toHaveURL(new RegExp(`/dogs/${COOPER_ID}`), { timeout: 20_000 });
    });

    await test.step('2. in the entry wizard, "No registration number yet" adds a dog and selects it', async () => {
      await page.goto(`/secretary/register/${SHOW_ID}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'Select Dogs to Register' })).toBeVisible({
        timeout: 30_000,
      });
      await page.getByRole('button', { name: /Create New/ }).click();
      await page.getByRole('menuitem', { name: /Dog Only/ }).click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 20_000 });
      await dialog.getByRole('button', { name: 'No registration number yet' }).click();
      await dialog.getByLabel(/Call Name/i).fill(heldDog);
      await dialog.getByRole('combobox', { name: /^Sex/ }).click();
      await page.getByRole('option', { name: /^Male/ }).first().click();
      await dialog.getByLabel(/Date of Birth/i).fill('2020-01-15');
      await dialog.getByRole('combobox', { name: /^Owner/ }).click();
      await page
        .getByRole('listbox')
        .getByRole('option', { name: journeyOwner.fullName })
        .first()
        .click();
      // Add Dog only shows on the last tab; earlier tabs stay clickable.
      await dialog.getByRole('tab', { name: /Optional details/i }).click();
      await dialog.getByRole('button', { name: 'Add Dog', exact: true }).click();
      await expect(page.getByText(/1 selected/).first()).toBeVisible({ timeout: 30_000 });
    });

    await test.step('3. the dog is entered in Interior Novice B with the secretary paying', async () => {
      await page.getByRole('button', { name: /next/i }).click();
      await expect(page.getByRole('heading', { name: 'Select Classes', exact: true })).toBeVisible({
        timeout: 15_000,
      });
      const chip = page.getByRole('checkbox', {
        name: new RegExp(`Enter ${heldDog} in Interior.*Novice B`),
      });
      await expect(chip).toBeEnabled({ timeout: 30_000 });
      await clickClearOfStickyChrome(page, chip);
      await expect(page.getByText(/1 selected/).first()).toBeVisible();

      await page.getByRole('button', { name: /next/i }).click();
      await page.waitForSelector('text=Handlers', { timeout: 15_000 });
      await page.getByRole('button', { name: /next/i }).click();
      await page.waitForSelector('text=Payment Information', { timeout: 15_000 });
      await page.getByRole('button', { name: /Secretary Payment \(Already Received\)/i }).click();
      // Money received at the desk names its method (MYK9-677): without it the save is
      // refused with "Choose whether the payment was received as cash or check".
      const cash = page
        .getByRole('group', { name: 'Received as' })
        .getByRole('button', { name: 'Cash', exact: true });
      await cash.click();
      await expect(cash).toHaveAttribute('aria-pressed', 'true');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      // #entry-agreement is a hidden native input; its label toggles it.
      const agreement = page.locator('label[for="entry-agreement"]');
      await expect(agreement).toBeVisible({ timeout: 10_000 });
      await agreement.click();
      const submit = page.getByRole('button', { name: /^Submit entry$/ });
      await expect(submit).toBeEnabled();
      await submit.click();
      await expect(page.getByRole('heading', { name: /^Entry submitted\./i })).toBeVisible({
        timeout: 60_000,
      });
    });

    await test.step('4. the entry is listed under Registration number needed', async () => {
      await expect(async () => {
        await page.goto(registrationNeededUrl, { waitUntil: 'domcontentloaded' });
        await expect(page.getByRole('heading', { name: /Registration number needed/ })).toBeVisible(
          { timeout: 10_000 }
        );
        await expect(row()).toHaveCount(1, { timeout: 10_000 });
      }).toPass({ timeout: 90_000 });
      await expect(row()).toContainText(/AKC number missing/);
    });

    await test.step('5. the held dog is not on the class run sheet', async () => {
      await page.goto(runSheetUrl, { waitUntil: 'domcontentloaded' });
      const sheet = page.getByTestId('secretary-run-sheet');
      // Positive control on the same page and load: a seeded entry in this class does render.
      await expect(sheet).toContainText(SEEDED_RUN_SHEET_DOG, { timeout: 45_000 });
      await expect(sheet).not.toContainText(heldDog);
    });

    await test.step('6. Add registration records the number and the row leaves the list', async () => {
      await page.goto(registrationNeededUrl, { waitUntil: 'domcontentloaded' });
      await expect(row()).toHaveCount(1, { timeout: 45_000 });
      await row()
        .getByRole('button', { name: new RegExp(`Add registration for .*${heldDog}`) })
        .click();

      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('heading', { name: 'Add Registration' })).toBeVisible({
        timeout: 20_000,
      });
      await dialog.locator('#organization').click();
      await page.getByRole('option', { name: AKC_OPTION }).click();
      await dialog.locator('#registeredName').fill('E2E Held Dog Registered');
      await dialog.locator('#breed').click();
      await page.getByPlaceholder('Search breeds…').fill('Golden Retriever');
      await page
        .getByRole('listbox', { name: 'Breeds' })
        .getByRole('option', { name: 'Golden Retriever', exact: true })
        .click();
      await dialog.locator('#registrationNumber').fill(heldRegistration);
      const saved = page.waitForResponse(
        r => r.url().includes('/rest/v1/dog_registrations') && r.request().method() === 'POST',
        { timeout: 30_000 }
      );
      await dialog.getByRole('button', { name: 'Add Registration', exact: true }).click();
      expect((await saved).ok()).toBe(true);
      await expect(row()).toHaveCount(0, { timeout: 30_000 });
    });

    await test.step('7. the released entry is on the class run sheet', async () => {
      // The server's held verdict clears once the registration syncs; each load re-reads it.
      await expect(async () => {
        await page.goto(runSheetUrl, { waitUntil: 'domcontentloaded' });
        await expect(page.getByTestId('secretary-run-sheet')).toContainText(heldDog, {
          timeout: 10_000,
        });
      }).toPass({ timeout: 90_000 });
      await expect(page.getByTestId('secretary-run-sheet')).toContainText(SEEDED_RUN_SHEET_DOG);
    });
  });
});

test.describe('Number-first Add Dog: an exhibitor meets a number that belongs to another owner', () => {
  installBrowserDiagnostics(test);
  test.skip(
    !DATA_REQUIRED,
    'Stateful: creates a fixture dog owned by someone else. ' +
      'Runs only on the seeded isolated Playwright Regression target.'
  );
  test.use({ viewport: PHONE });

  let admin: SupabaseClient;
  const foreignDog = uniqueCallName('Foreign');
  const foreignNumber = uniqueRegistrationNumber('FOREIGN');

  test.beforeAll(async () => {
    admin = waitlistAdmin();
    const owner = await personByEmail(admin, TEST_USERS.SECRETARY.email);
    await createForeignDog(admin, owner.id, foreignDog, foreignNumber);
  });

  test.afterAll(async () => {
    if (admin) await removeDogsNamed(admin, [foreignDog]);
  });

  test('Find dog says the number is taken and reveals nothing else about the dog (MYK9-1162)', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await installSharedStagingWriteGuard(page, { strictRpcWrites: true });
    await signInAsExhibitor(page, '/dogs');
    await openAddDogFromDogsPage(page);
    const dialog = await findDogByNumber(page, foreignNumber);

    await expect(dialog.getByText(TAKEN_MESSAGE)).toBeVisible({ timeout: 30_000 });
    // Nothing about the other dog: no card to use it, not its name, its registered name or owner.
    await expect(dialog.getByRole('button', { name: 'Use existing dog' })).toHaveCount(0);
    await expect(dialog).not.toContainText(foreignDog);
    await expect(dialog).not.toContainText('of Elsewhere');
    await expect(dialog).not.toContainText(TEST_USERS.SECRETARY.email);
    // An exhibitor cannot skip the number.
    await expect(dialog.getByRole('button', { name: 'No registration number yet' })).toHaveCount(0);
    await expectNoHorizontalOverflow(page, 'Add Dog taken-number message at 390px');
  });
});
