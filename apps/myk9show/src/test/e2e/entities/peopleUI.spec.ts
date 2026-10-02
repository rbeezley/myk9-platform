import { test, expect, Page } from '@playwright/test';
import { TEST_USERS, signInAsSecretary, signInAsAdmin } from '../helpers/testUsers';
import { chooseAction } from '../helpers/actionsMenu';

/**
 * UI-driven e2e tests for the People section — secretary role.
 *
 * Strategy:
 *   - Create Person A and Person B with timestamped names so runs never collide.
 *   - Tests run serially so state persists across them.
 *   - Person A keeps a dog at the end (asserts delete-gating).
 *   - Person B is created and deleted within the suite.
 *
 * Auth: secretary fixture plus E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD for site admin. Deleting a
 *   person is site admin or self only (MYK9-934), so the delete tests run as the site admin.
 */

test.describe.configure({ mode: 'serial' });

const RUN_ID = Date.now();
const PERSON_A_FIRST = 'E2E';
const PERSON_A_LAST = `Personalpha ${RUN_ID}`;
const PERSON_A_EMAIL = `e2e.alpha.${RUN_ID}@example.com`;
const PERSON_B_FIRST = 'E2E';
const PERSON_B_LAST = `Personbeta ${RUN_ID}`;
const PERSON_B_EMAIL = `e2e.beta.${RUN_ID}@example.com`;
const ADMIN_PERSON_FIRST = 'E2E';
const ADMIN_PERSON_LAST = `Adminperson ${RUN_ID}`;
const ADMIN_PERSON_EMAIL = `e2e.admin.${RUN_ID}@example.com`;
const DOG_NAME = `E2E PeopleDog ${RUN_ID}`;

// Admin lifecycle coverage is gated on the env-backed admin account being set.
const ADMIN_EMAIL = TEST_USERS.SITE_ADMIN.email;
const ADMIN_PASSWORD = TEST_USERS.SITE_ADMIN.password;

async function gotoPeopleBrowse(page: Page) {
  await page.goto('/people', { waitUntil: 'networkidle' });
  // h1 is sr-only; assert via the breadcrumb.
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Person' })).toBeVisible();
}

// ---------------------------------------------------------------------------
// Browse
// ---------------------------------------------------------------------------

test.describe('People UI — Browse (secretary)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  test('browse loads with toolbar, view toggle, and people count', async ({ page }) => {
    await gotoPeopleBrowse(page);
    await expect(page.getByRole('button', { name: 'Add Person' })).toBeVisible();
    await expect(page.getByPlaceholder('Search people by name or email...')).toBeVisible();
    // The toolbar renders the labelled "Show:" view select and the standard
    // Cards/Table view toggle (BrowsePeoplePage uses the default CARD_TABLE_MODES).
    // Target the toggles by exact aria-label ("Table view" not "Table", which
    // also matches "Reset table view").
    await expect(page.getByRole('combobox', { name: 'Show: People views' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cards view', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Table view', exact: true })).toBeVisible();
    await expect(page.getByText(/^Showing (all )?\d+( of \d+)? (people|person)\.$/)).toBeVisible();
  });

  test('search filters list by name or email', async ({ page }) => {
    await gotoPeopleBrowse(page);
    const searchBox = page.getByPlaceholder('Search people by name or email...');
    await searchBox.fill('Alice');
    await expect(page.getByText(/^Showing \d+ of \d+ (people|person)\.$/)).toBeVisible();
    await searchBox.clear();
    await expect(page.getByText(/^Showing all \d+ (people|person)\.$/)).toBeVisible();
  });

  test('Show select applies a role view and "Show all people" clears it', async ({ page }) => {
    await gotoPeopleBrowse(page);
    await expect(page.getByText(/^Showing all \d+ (people|person)\.$/)).toBeVisible();

    // Pick the Judges view from the labelled select.
    await page.getByRole('combobox', { name: 'Show: People views' }).click();
    await page.getByRole('option', { name: /^Judges/ }).click();
    await expect(page.getByText(/^Showing \d+ of \d+ (people|person)\.$/)).toBeVisible();

    // Show all returns to the unfiltered list.
    await page.getByRole('button', { name: 'Show all people' }).click();
    await expect(page.getByText(/^Showing all \d+ (people|person)\.$/)).toBeVisible();
  });

  test('table view renders columns', async ({ page }) => {
    await gotoPeopleBrowse(page);
    await page.getByRole('button', { name: 'Table view', exact: true }).click();
    await expect(page.getByRole('columnheader', { name: /Name/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Email/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Roles/i })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

test.describe('People UI — Create (secretary)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  test('Create Person A — opens panel, fills, saves, navigates to detail', async ({ page }) => {
    await gotoPeopleBrowse(page);
    await page.getByRole('button', { name: 'Add Person' }).click();

    // The dialog opens with Basic Info tab.
    const dialog = page.getByRole('dialog', { name: 'Add Person' });
    await expect(dialog).toBeVisible();

    await page.getByRole('textbox', { name: /First Name/ }).fill(PERSON_A_FIRST);
    await page.getByRole('textbox', { name: /Last Name/ }).fill(PERSON_A_LAST);
    await page.getByRole('textbox', { name: /Email Address/ }).fill(PERSON_A_EMAIL);
    // MYK9-931: Basic Info -> Contact; Add Person is on the last tab.
    await page
      .getByRole('dialog', { name: 'Add Person' })
      .getByRole('button', { name: /Next: Contact/ })
      .click();

    // Wait for the create POST and the navigation to the new person's detail.
    const [createResponse] = await Promise.all([
      page.waitForResponse(
        resp =>
          resp.url().includes('/rest/v1/people') &&
          resp.request().method() === 'POST' &&
          resp.status() < 300
      ),
      page
        .getByRole('dialog', { name: 'Add Person' })
        .getByRole('button', { name: 'Add Person' })
        .click(),
    ]);
    expect(createResponse.ok()).toBe(true);

    // INTENT (regression guard): handleCreateUser awaits a React Query
    // invalidation BEFORE navigating, so the new person is in cache and
    // PersonDetailPage doesn't redirect back to /people. If this URL match
    // fails, the cache-invalidation regression has reappeared.
    await page.waitForURL(/\/people\/[^/]+/, { timeout: 10000 });
    await expect(
      page.getByRole('heading', {
        name: `${PERSON_A_FIRST} ${PERSON_A_LAST}`,
        level: 1,
      })
    ).toBeVisible();
  });

  test('Create Person B (kept in directory for delete-then-confirm)', async ({ page }) => {
    await gotoPeopleBrowse(page);
    await page.getByRole('button', { name: 'Add Person' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add Person' });
    await expect(dialog).toBeVisible();
    await page.getByRole('textbox', { name: /First Name/ }).fill(PERSON_B_FIRST);
    await page.getByRole('textbox', { name: /Last Name/ }).fill(PERSON_B_LAST);
    await page.getByRole('textbox', { name: /Email Address/ }).fill(PERSON_B_EMAIL);
    // MYK9-931: Basic Info -> Contact; Add Person is on the last tab.
    await page
      .getByRole('dialog', { name: 'Add Person' })
      .getByRole('button', { name: /Next: Contact/ })
      .click();
    const [resp] = await Promise.all([
      page.waitForResponse(
        r =>
          r.url().includes('/rest/v1/people') && r.request().method() === 'POST' && r.status() < 300
      ),
      page
        .getByRole('dialog', { name: 'Add Person' })
        .getByRole('button', { name: 'Add Person' })
        .click(),
    ]);
    expect(resp.ok()).toBe(true);
    await page.waitForURL(/\/people\/[^/]+/);
  });

  test('Create rejects submission when required fields are empty', async ({ page }) => {
    await gotoPeopleBrowse(page);
    await page.getByRole('button', { name: 'Add Person' }).click();
    await expect(page.getByRole('dialog', { name: 'Add Person' })).toBeVisible();
    // Fill ONLY last name (no first name, no email). That gives the form
    // hasChanges=true so Save is enabled, but it remains schema-invalid
    // because firstName + email are still required-empty. Clearing a
    // touched field doesn't work as a setup — hasChanges flips back to
    // false because the value matches the (empty) initial value.
    await page.getByRole('textbox', { name: /Last Name/ }).fill('OnlyLast');
    // Next is blocked on Basic Info and says why (MYK9-931); the dialog stays open.
    await page
      .getByRole('dialog', { name: 'Add Person' })
      .getByRole('button', { name: /Next: Contact/ })
      .click();
    await expect(page.getByTestId('edit-panel-step-blocked')).toContainText(
      'Please enter a first name'
    );
    await expect(page.getByRole('dialog', { name: 'Add Person' })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Detail + Edit
// ---------------------------------------------------------------------------

test.describe('People UI — Detail + Edit (secretary)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  test('detail page renders Person A with contact + dogs association', async ({ page }) => {
    await page.goto('/people');
    await page.getByRole('link', { name: new RegExp(PERSON_A_LAST) }).click();
    await page.waitForURL(/\/people\/[^/]+/);
    await expect(
      page.getByRole('heading', {
        name: `${PERSON_A_FIRST} ${PERSON_A_LAST}`,
        level: 1,
      })
    ).toBeVisible();
    // Email is rendered both as a paragraph (hero) and a mailto link in the
    // contact section — target the link to avoid strict-mode collisions.
    await expect(page.getByRole('link', { name: PERSON_A_EMAIL })).toBeVisible();
    // Dogs section + Add Dog button is the entry point for the
    // associate-dog-as-owner flow tested below.
    await expect(page.getByRole('button', { name: 'Add Dog' })).toBeVisible();
  });

  test('edit Person A — saves phone via Contact tab', async ({ page }) => {
    await page.goto('/people');
    await page.getByRole('link', { name: new RegExp(PERSON_A_LAST) }).click();
    await page.waitForURL(/\/people\/[^/]+/);

    await chooseAction(page, 'Edit person');
    await expect(page.getByRole('dialog', { name: 'Edit Person' })).toBeVisible();
    await page.getByRole('tab', { name: 'Contact' }).click();
    await page.getByRole('textbox', { name: 'Phone Number' }).fill('555-7890');

    const [resp] = await Promise.all([
      page.waitForResponse(
        r =>
          r.url().includes('/rest/v1/people') &&
          r.request().method() === 'PATCH' &&
          r.status() < 300
      ),
      page.getByRole('button', { name: 'Save Changes' }).click(),
    ]);
    expect(resp.ok()).toBe(true);
    await expect(page.getByText('555-7890')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Associate dog as owner (key flow)
// ---------------------------------------------------------------------------

test.describe('People UI — Add Dog with Person as Owner (secretary)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  test('Add Dog from Person A profile — Owner pre-fills with that person', async ({ page }) => {
    await page.goto('/people');
    await page.getByRole('link', { name: new RegExp(PERSON_A_LAST) }).click();
    await page.waitForURL(/\/people\/[^/]+/);

    await page.getByRole('button', { name: 'Add Dog', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Add Dog' })).toBeVisible();

    // INTENT (regression guard): when the secretary opens AddDogPanel from a
    // person's profile, currentUserPersonId is that person's id. The panel's
    // Owner field MUST be pre-filled, regardless of the secretary's own
    // role. Was previously gated to EXHIBITOR only — bug 6 in this PR.
    const ownerCombobox = page.getByRole('combobox').filter({ hasText: PERSON_A_LAST });
    await expect(ownerCombobox).toBeVisible();

    await page.getByRole('textbox', { name: /Call Name/ }).fill(DOG_NAME);

    // Pick gender Female via the first combobox in the form (Gender comes
    // before Owner in DOM order). hasText filtering can't disambiguate
    // reliably here because Owner is now pre-filled with the person name and
    // Base UI's combobox descendant text picks up extra placeholder fragments.
    // Base UI keeps portal options mounted, so target the visible option.
    await page.getByRole('combobox').first().click();
    const femaleOption = page.locator('[role="option"]:visible').filter({ hasText: /Female/ });
    await femaleOption.click();

    // Date of Birth
    await page.getByRole('textbox', { name: /Date of Birth/ }).fill('2020-01-15');

    // MYK9-931: Add Dog only shows on the last tab; earlier tabs stay clickable.
    await page
      .getByRole('dialog')
      .getByRole('tab', { name: /Optional details/i })
      .click();

    // Submit
    const [resp] = await Promise.all([
      page.waitForResponse(
        r =>
          r.url().includes('/rest/v1/dogs') && r.request().method() === 'POST' && r.status() < 300
      ),
      page.getByRole('dialog').getByRole('button', { name: 'Add Dog', exact: true }).click(),
    ]);
    expect(resp.ok()).toBe(true);

    // Person profile updates to show 1 registered dog. The phrase appears in
    // both the sidebar association card and main tab content, so assert that
    // at least one visible count updated instead of requiring unique text.
    await expect(page.getByText(/1 registered dog/).first()).toBeVisible({ timeout: 10000 });
    // The full associated-dogs list lives in the main content tabs; it's
    // backed by the offline-first dog store and may take a beat to refresh
    // after the AddDogPanel closes. Reload to force a fresh read so the test
    // doesn't race the store.
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByText(DOG_NAME).first()).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// Delete gating
// ---------------------------------------------------------------------------

test.describe('People UI — Delete (secretary)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  // MYK9-934: secretaries and club admins never delete a person. The Edit panel opens (positive
  // control: its Save Changes button) and carries no Delete person.
  test('a secretary is never offered Delete person', async ({ page }) => {
    await page.goto('/people');
    await page.getByRole('link', { name: new RegExp(PERSON_B_LAST) }).click();
    await page.waitForURL(/\/people\/[^/]+/);

    await chooseAction(page, 'Edit person');
    await expect(page.getByRole('button', { name: 'Save Changes' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete person', exact: true })).toHaveCount(0);
  });
});

// Deleting a person is a site-admin (or self) action (MYK9-934), so the delete gating runs as
// the site admin.
test.describe('People UI — Delete (site admin)', () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set — skipping site-admin People delete coverage'
  );

  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  test('Delete Person A — blocked because they own a dog', async ({ page }) => {
    await page.goto('/people');
    await page.getByRole('link', { name: new RegExp(PERSON_A_LAST) }).click();
    await page.waitForURL(/\/people\/[^/]+/);

    // Delete person is the Edit panel's footer button, never a menu item (CRUD standard Phase 3).
    await chooseAction(page, 'Edit person');
    await page.getByRole('button', { name: 'Delete person', exact: true }).click();

    // INTENT (regression guard): delete must be blocked while the person
    // owns dogs. The shared dialog names the dog count from delete_preview and
    // holds Delete off; Keep it leaves without deleting.
    const blockedDeleteDialog = page.getByRole('alertdialog', { name: /^Delete the person / });
    await expect(blockedDeleteDialog).toBeVisible();
    await expect(blockedDeleteDialog.getByText(/still owns 1 dog/)).toBeVisible();
    const deleteBtn = blockedDeleteDialog.getByRole('button', {
      name: 'Delete person',
      exact: true,
    });
    await expect(deleteBtn).toBeDisabled();

    await blockedDeleteDialog.getByRole('button', { name: 'Keep it', exact: true }).click();
    await expect(blockedDeleteDialog).not.toBeVisible();
  });

  test('Delete Person B — confirmation cancel keeps the person', async ({ page }) => {
    await page.goto('/people');
    await page.getByRole('link', { name: new RegExp(PERSON_B_LAST) }).click();
    await page.waitForURL(/\/people\/[^/]+/);

    // Delete person is the Edit panel's footer button, never a menu item (CRUD standard Phase 3).
    await chooseAction(page, 'Edit person');
    await page.getByRole('button', { name: 'Delete person', exact: true }).click();

    const cancelDeleteDialog = page.getByRole('alertdialog', { name: /^Delete the person / });
    await expect(cancelDeleteDialog).toBeVisible();
    await cancelDeleteDialog.getByRole('button', { name: 'Keep it', exact: true }).click();
    await expect(cancelDeleteDialog).not.toBeVisible();
    // Still on the same person's detail page.
    await expect(page).toHaveURL(/\/people\/[^/]+/);
  });

  test('Delete Person B — confirm removes the person from the list', async ({ page }) => {
    await page.goto('/people');
    await page.getByRole('link', { name: new RegExp(PERSON_B_LAST) }).click();
    await page.waitForURL(/\/people\/[^/]+/);

    // Delete person is the Edit panel's footer button, never a menu item (CRUD standard Phase 3).
    await chooseAction(page, 'Edit person');
    await page.getByRole('button', { name: 'Delete person', exact: true }).click();
    const deleteDialog = page.getByRole('alertdialog', { name: /^Delete the person / });
    await expect(deleteDialog).toBeVisible();

    const [resp] = await Promise.all([
      page.waitForResponse(
        r =>
          r.url().includes('/rest/v1/rpc/soft_delete_person') &&
          r.request().method() === 'POST' &&
          r.status() < 300
      ),
      deleteDialog.getByRole('button', { name: 'Delete person', exact: true }).click(),
    ]);
    expect(resp.ok()).toBe(true);

    await page.waitForURL(/\/people/, { timeout: 10000 });
    await expect(page.getByText(new RegExp(PERSON_B_LAST))).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Admin lifecycle coverage
// ---------------------------------------------------------------------------

test.describe('People UI — Admin CRUD lifecycle', () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set — skipping admin People CRUD coverage'
  );

  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  test('site admin can create, read, edit, cancel delete, and delete a person', async ({
    page,
  }) => {
    await gotoPeopleBrowse(page);
    await page.getByRole('button', { name: 'Add Person' }).click();
    await expect(page.getByRole('dialog', { name: 'Add Person' })).toBeVisible();

    await page.getByRole('textbox', { name: /First Name/ }).fill(ADMIN_PERSON_FIRST);
    await page.getByRole('textbox', { name: /Last Name/ }).fill(ADMIN_PERSON_LAST);
    await page.getByRole('textbox', { name: /Email Address/ }).fill(ADMIN_PERSON_EMAIL);
    // MYK9-931: Basic Info -> Contact; Add Person is on the last tab.
    await page
      .getByRole('dialog', { name: 'Add Person' })
      .getByRole('button', { name: /Next: Contact/ })
      .click();

    const [createResponse] = await Promise.all([
      page.waitForResponse(
        resp =>
          resp.url().includes('/rest/v1/people') &&
          resp.request().method() === 'POST' &&
          resp.status() < 300
      ),
      page
        .getByRole('dialog', { name: 'Add Person' })
        .getByRole('button', { name: 'Add Person' })
        .click(),
    ]);
    expect(createResponse.ok()).toBe(true);

    await page.waitForURL(/\/people\/[^/]+/, { timeout: 10000 });
    await expect(
      page.getByRole('heading', {
        name: `${ADMIN_PERSON_FIRST} ${ADMIN_PERSON_LAST}`,
        level: 1,
      })
    ).toBeVisible();
    await expect(page.getByRole('link', { name: ADMIN_PERSON_EMAIL })).toBeVisible();

    await chooseAction(page, 'Edit person');
    await expect(page.getByRole('dialog', { name: 'Edit Person' })).toBeVisible();
    await page.getByRole('tab', { name: 'Contact' }).click();
    await page.getByRole('textbox', { name: 'Phone Number' }).fill('555-4567');

    const [updateResponse] = await Promise.all([
      page.waitForResponse(
        resp =>
          resp.url().includes('/rest/v1/people') &&
          resp.request().method() === 'PATCH' &&
          resp.status() < 300
      ),
      page.getByRole('button', { name: 'Save Changes' }).click(),
    ]);
    expect(updateResponse.ok()).toBe(true);
    await expect(page.getByText('555-4567')).toBeVisible();

    // Delete person is the Edit panel's footer button, never a menu item (CRUD standard Phase 3).
    await chooseAction(page, 'Edit person');
    await page.getByRole('button', { name: 'Delete person', exact: true }).click();
    const cancelDeleteDialog = page.getByRole('alertdialog', { name: /^Delete the person / });
    await expect(cancelDeleteDialog).toBeVisible();
    await cancelDeleteDialog.getByRole('button', { name: 'Keep it', exact: true }).click();
    await expect(cancelDeleteDialog).not.toBeVisible();
    // Keep it leaves the Edit panel open, so its footer Delete is still there.
    await expect(page.getByRole('heading', { name: /Adminperson/, level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Delete person', exact: true }).click();
    const deleteDialog = page.getByRole('alertdialog', { name: /^Delete the person / });
    await expect(deleteDialog).toBeVisible();

    const [deleteResponse] = await Promise.all([
      page.waitForResponse(
        resp =>
          resp.url().includes('/rest/v1/rpc/soft_delete_person') &&
          resp.request().method() === 'POST' &&
          resp.status() < 300
      ),
      deleteDialog.getByRole('button', { name: 'Delete person', exact: true }).click(),
    ]);
    expect(deleteResponse.ok()).toBe(true);

    await page.waitForURL(/\/people/, { timeout: 10000 });
    await page.getByPlaceholder('Search people by name or email...').fill(ADMIN_PERSON_EMAIL);
    await expect(page.getByText('No people match your search or filters.')).toBeVisible();
    await expect(page.getByText(ADMIN_PERSON_EMAIL)).not.toBeVisible();
  });
});
