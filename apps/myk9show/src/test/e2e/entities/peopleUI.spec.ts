import { test, expect, Page } from '@playwright/test';

/**
 * UI-driven e2e tests for the People section — secretary role.
 *
 * Strategy:
 *   - Create Person A and Person B with timestamped names so runs never collide.
 *   - Tests run serially so state persists across them.
 *   - Person A keeps a dog at the end (asserts delete-gating).
 *   - Person B is created and deleted within the suite.
 *
 * Auth: secretary@myk9t.com / testpass123 (matches clubsUI / dogsUI specs).
 */

test.describe.configure({ mode: 'serial' });

const RUN_ID = Date.now();
const PERSON_A_FIRST = 'E2E';
const PERSON_A_LAST = `Personalpha ${RUN_ID}`;
const PERSON_A_EMAIL = `e2e.alpha.${RUN_ID}@example.com`;
const PERSON_B_FIRST = 'E2E';
const PERSON_B_LAST = `Personbeta ${RUN_ID}`;
const PERSON_B_EMAIL = `e2e.beta.${RUN_ID}@example.com`;
const DOG_NAME = `E2E PeopleDog ${RUN_ID}`;

const SECRETARY_EMAIL = 'secretary@myk9t.com';
const SECRETARY_PASSWORD = 'testpass123';

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/sign-in', { waitUntil: 'networkidle' });
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('password-input').fill(password);
  await page.getByTestId('sign-in-button').click();
  await page.waitForURL(url => !url.pathname.includes('/sign-in'), { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

async function signInAsSecretary(page: Page) {
  await signIn(page, SECRETARY_EMAIL, SECRETARY_PASSWORD);
}

async function gotoPeopleBrowse(page: Page) {
  await page.goto('/people', { waitUntil: 'networkidle' });
  // h1 is sr-only; assert via the breadcrumb.
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New Person' })).toBeVisible();
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
    await expect(page.getByRole('button', { name: 'New Person' })).toBeVisible();
    await expect(page.getByPlaceholder('Search people by name or email...')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Filter' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Grid' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Table' })).toBeVisible();
    await expect(page.getByText(/of \d+ (people|person)/)).toBeVisible();
  });

  test('search filters list by name or email', async ({ page }) => {
    await gotoPeopleBrowse(page);
    const searchBox = page.getByPlaceholder('Search people by name or email...');
    await searchBox.fill('Alice');
    await expect(page.getByText(/of \d+ people \(filtered\)/)).toBeVisible();
    await searchBox.clear();
    await expect(page.getByText(/^\d+ of \d+ people$/)).toBeVisible();
  });

  test('select filter shows pending pill — does NOT auto-apply on add', async ({ page }) => {
    await gotoPeopleBrowse(page);
    const initialCount = await page.getByText(/^\d+ of \d+ people$/).innerText();

    // Add the Role filter
    await page.getByRole('button', { name: 'Filter' }).click();
    await page.getByRole('button', { name: 'Role', exact: true }).click();

    // Pending pill is visible with the "Choose…" placeholder; the list must
    // NOT have been re-filtered (regression guard for the "Chairman"
    // auto-apply bug).
    await expect(page.getByRole('button', { name: /Role:\s*Choose/ })).toBeVisible();
    const afterAddCount = await page.getByText(/^\d+ of \d+ people$/).innerText();
    expect(afterAddCount).toBe(initialCount);

    // Pick Judge → list filters and pill becomes "Role: Judge".
    await page.getByRole('button', { name: 'Judge', exact: true }).click();
    await expect(page.getByRole('button', { name: /Role:\s*Judge/ })).toBeVisible();
    await expect(page.getByText(/of \d+ people \(filtered\)/)).toBeVisible();

    // Removing the filter clears the count back to unfiltered.
    await page.getByRole('button', { name: 'Remove Role filter' }).click();
    await expect(page.getByText(/^\d+ of \d+ people$/)).toBeVisible();
  });

  test('table view renders columns', async ({ page }) => {
    await gotoPeopleBrowse(page);
    await page.getByRole('button', { name: 'Table' }).click();
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
    await page.getByRole('button', { name: 'New Person' }).click();

    // The dialog opens with Basic Info tab.
    const dialog = page.getByRole('dialog', { name: 'Edit User' });
    await expect(dialog).toBeVisible();

    await page.getByRole('textbox', { name: /First Name/ }).fill(PERSON_A_FIRST);
    await page.getByRole('textbox', { name: /Last Name/ }).fill(PERSON_A_LAST);
    await page.getByRole('textbox', { name: /Email Address/ }).fill(PERSON_A_EMAIL);

    // Wait for the create POST and the navigation to the new person's detail.
    const [createResponse] = await Promise.all([
      page.waitForResponse(
        resp =>
          resp.url().includes('/rest/v1/people') &&
          resp.request().method() === 'POST' &&
          resp.status() < 300
      ),
      page.getByRole('button', { name: 'Save Changes' }).click(),
    ]);
    expect(createResponse.ok()).toBe(true);

    // INTENT (regression guard): handleCreateUser awaits a React Query
    // invalidation BEFORE navigating, so the new person is in cache and
    // PersonDetailPage doesn't redirect back to /people. If this URL match
    // fails, the cache-invalidation regression has reappeared.
    await page.waitForURL(/\/users\/[^/]+/, { timeout: 10000 });
    await expect(
      page.getByRole('heading', {
        name: `${PERSON_A_FIRST} ${PERSON_A_LAST}`,
        level: 1,
      })
    ).toBeVisible();
  });

  test('Create Person B (kept in directory for delete-then-confirm)', async ({ page }) => {
    await gotoPeopleBrowse(page);
    await page.getByRole('button', { name: 'New Person' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit User' });
    await expect(dialog).toBeVisible();
    await page.getByRole('textbox', { name: /First Name/ }).fill(PERSON_B_FIRST);
    await page.getByRole('textbox', { name: /Last Name/ }).fill(PERSON_B_LAST);
    await page.getByRole('textbox', { name: /Email Address/ }).fill(PERSON_B_EMAIL);
    const [resp] = await Promise.all([
      page.waitForResponse(
        r =>
          r.url().includes('/rest/v1/people') && r.request().method() === 'POST' && r.status() < 300
      ),
      page.getByRole('button', { name: 'Save Changes' }).click(),
    ]);
    expect(resp.ok()).toBe(true);
    await page.waitForURL(/\/users\/[^/]+/);
  });

  test('Create rejects submission when required fields are empty', async ({ page }) => {
    await gotoPeopleBrowse(page);
    await page.getByRole('button', { name: 'New Person' }).click();
    await expect(page.getByRole('dialog', { name: 'Edit User' })).toBeVisible();
    // Fill ONLY last name (no first name, no email). That gives the form
    // hasChanges=true so Save is enabled, but it remains schema-invalid
    // because firstName + email are still required-empty. Clearing a
    // touched field doesn't work as a setup — hasChanges flips back to
    // false because the value matches the (empty) initial value.
    await page.getByRole('textbox', { name: /Last Name/ }).fill('OnlyLast');
    // Clicking Save must surface the schema's first-name validation error
    // and keep the dialog open. Use getByRole('alert') — the same text
    // appears inline-under-the-field AND in the footer error summary, so
    // getByText would hit a strict-mode collision.
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Please enter a first name' })
    ).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Edit User' })).toBeVisible();
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
    await page.waitForURL(/\/users\/[^/]+/);
    await expect(
      page.getByRole('heading', {
        name: `${PERSON_A_FIRST} ${PERSON_A_LAST}`,
        level: 1,
      })
    ).toBeVisible();
    // Email is rendered both as a paragraph (hero) and a mailto link in the
    // contact section — target the link to avoid strict-mode collisions.
    await expect(page.getByRole('link', { name: PERSON_A_EMAIL })).toBeVisible();
    // Dogs section + Add New Dog button is the entry point for the
    // associate-dog-as-owner flow tested below.
    await expect(page.getByRole('button', { name: 'Add New Dog' })).toBeVisible();
  });

  test('edit Person A — saves phone via Contact tab', async ({ page }) => {
    await page.goto('/people');
    await page.getByRole('link', { name: new RegExp(PERSON_A_LAST) }).click();
    await page.waitForURL(/\/users\/[^/]+/);

    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Edit User' })).toBeVisible();
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

  test('Add New Dog from Person A profile — Owner pre-fills with that person', async ({ page }) => {
    await page.goto('/people');
    await page.getByRole('link', { name: new RegExp(PERSON_A_LAST) }).click();
    await page.waitForURL(/\/users\/[^/]+/);

    await page.getByRole('button', { name: 'Add New Dog' }).click();
    await expect(page.getByRole('dialog', { name: 'Add New Dog' })).toBeVisible();

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
    await page.getByRole('combobox').first().click();
    const femaleOption = page.getByRole('option', { name: /Female/ }).filter({ visible: true });
    await femaleOption.waitFor({ state: 'visible' });
    await femaleOption.click();

    // Date of Birth
    await page.getByRole('textbox', { name: /Date of Birth/ }).fill('2020-01-15');

    // Submit
    const [resp] = await Promise.all([
      page.waitForResponse(
        r =>
          r.url().includes('/rest/v1/dogs') && r.request().method() === 'POST' && r.status() < 300
      ),
      page.getByRole('button', { name: 'Create Dog' }).click(),
    ]);
    expect(resp.ok()).toBe(true);

    // Person profile updates to show 1 registered dog (right-sidebar counter).
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

  test('Delete Person A — blocked because they own a dog', async ({ page }) => {
    await page.goto('/people');
    await page.getByRole('link', { name: new RegExp(PERSON_A_LAST) }).click();
    await page.waitForURL(/\/users\/[^/]+/);

    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();

    // INTENT (regression guard): delete must be blocked while the person
    // owns dogs. Title flips to "Cannot delete person", description names
    // the dog count, the confirm button is disabled, and the cancel-style
    // button reads "Close".
    await expect(page.getByRole('dialog', { name: 'Cannot delete person' })).toBeVisible();
    await expect(page.getByText(/owns 1 dog/)).toBeVisible();
    const deleteBtn = page.getByRole('button', { name: 'Delete' }).last();
    await expect(deleteBtn).toBeDisabled();

    // Close the dialog without deleting — Person A and its dog stay around.
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Cannot delete person' })).not.toBeVisible();
  });

  test('Delete Person B — confirmation cancel keeps the person', async ({ page }) => {
    await page.goto('/people');
    await page.getByRole('link', { name: new RegExp(PERSON_B_LAST) }).click();
    await page.waitForURL(/\/users\/[^/]+/);

    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();

    await expect(page.getByRole('dialog', { name: 'Delete Person' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog', { name: 'Delete Person' })).not.toBeVisible();
    // Still on the same person's detail page.
    await expect(page).toHaveURL(/\/users\/[^/]+/);
  });

  test('Delete Person B — confirm removes the person from the list', async ({ page }) => {
    await page.goto('/people');
    await page.getByRole('link', { name: new RegExp(PERSON_B_LAST) }).click();
    await page.waitForURL(/\/users\/[^/]+/);

    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await expect(page.getByRole('dialog', { name: 'Delete Person' })).toBeVisible();

    const [resp] = await Promise.all([
      page.waitForResponse(
        r =>
          r.url().includes('/rest/v1/people') &&
          (r.request().method() === 'PATCH' || r.request().method() === 'DELETE') &&
          r.status() < 300
      ),
      page.getByRole('button', { name: 'Delete' }).last().click(),
    ]);
    expect(resp.ok()).toBe(true);

    await page.waitForURL(/\/people/, { timeout: 10000 });
    await expect(page.getByText(new RegExp(PERSON_B_LAST))).not.toBeVisible();
  });
});
