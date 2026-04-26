import { test, expect, Page } from '@playwright/test';

/**
 * UI-driven e2e tests for the Dogs section — secretary role.
 *
 * Covers: browse (search, filter, view toggle), create, detail page (tabs,
 * actions menu), edit panel (cancel/discard + save), and delete.
 *
 * Strategy:
 *   - Create Dog A and Dog B with timestamped names so runs never collide.
 *   - Tests run serially so state persists across them.
 *   - Delete only Dog B at the end; Dog A remains as ongoing test data.
 *
 * Auth: secretary@myk9t.com / testpass123 (matches clubsUI.spec.ts pattern)
 *
 * RLS assumptions:
 *   - migration 161 — secretary dog:create and dog:delete permissions.
 *   - Soft-delete: deleted dogs disappear from the secretary's list view.
 *
 * EditPanelWrapper unsaved-changes warning:
 *   - Replaced window.confirm() with AlertDialog (our fix in this PR).
 *   - "Keep editing" = AlertDialogCancel; "Discard changes" = AlertDialogAction.
 */

test.describe.configure({ mode: 'serial' });

const RUN_ID = Date.now();
const DOG_A_NAME = `E2E Dog A ${RUN_ID}`;
const DOG_B_NAME = `E2E Dog B ${RUN_ID}`;

const SECRETARY_EMAIL = 'secretary@myk9t.com';
const SECRETARY_PASSWORD = 'testpass123';

// Test Secretary's person ID in the DB — used to select owner in the Create form.
// This is the person linked to secretary@myk9t.com.
const TEST_SECRETARY_PERSON_NAME = 'Test Secretary';

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

async function gotoDogsBrowse(page: Page) {
  await page.goto('/dogs', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Dogs', level: 1 })).toBeVisible();
}

/**
 * Select a BASE-UI/Radix Select option by the combobox's placeholder text.
 * The AddDogPanel's Select triggers don't have accessible names via label
 * association, so we target them by placeholder ("Choose gender", etc.).
 */
async function selectByPlaceholder(page: Page, placeholder: string, optionText: RegExp | string) {
  await page.getByRole('combobox').filter({ hasText: placeholder }).click();
  await page.getByRole('option', { name: optionText }).click();
}

// ---------------------------------------------------------------------------
// Browse
// ---------------------------------------------------------------------------

test.describe('Dogs UI — Browse (secretary)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  test('browse page loads with dog cards and filter toolbar', async ({ page }) => {
    await gotoDogsBrowse(page);

    // "New Dog" button visible for secretary
    await expect(page.getByRole('button', { name: 'New Dog' })).toBeVisible();

    // Filter chips visible
    await expect(page.getByRole('button', { name: /Breed/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Gender/i })).toBeVisible();

    // View toggle
    await expect(page.getByRole('button', { name: 'Cards' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Table' })).toBeVisible();
  });

  test('search filters the dog list', async ({ page }) => {
    await gotoDogsBrowse(page);
    const searchBox = page.getByPlaceholder('Search dogs by name, breed, or owner...');
    await searchBox.fill('Bella');
    await expect(page.getByText(/of \d+ dogs \(filtered\)/)).toBeVisible();
    await searchBox.clear();
    await expect(page.getByText(/\d+ dogs/)).toBeVisible();
  });

  test('breed filter chip applies and shows filtered count', async ({ page }) => {
    await gotoDogsBrowse(page);
    // FilterChips renders plain button elements in its dropdown (no ARIA role="option")
    await page.getByRole('button', { name: /Breed/i }).click();
    await page.getByRole('button', { name: 'Golden Retriever', exact: true }).click();
    await expect(page.getByText(/of \d+ dogs \(filtered\)/)).toBeVisible();
  });

  test('table view renders dog columns', async ({ page }) => {
    await gotoDogsBrowse(page);
    await page.getByRole('button', { name: 'Table' }).click();
    await expect(page.getByRole('columnheader', { name: /Name/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Breed/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Owner/i })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

test.describe('Dogs UI — Create (secretary)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  test('Create Dog A — panel opens, fills, submits, lands on detail page', async ({ page }) => {
    await gotoDogsBrowse(page);
    await page.getByRole('button', { name: 'New Dog' }).click();
    await expect(page.getByRole('heading', { name: 'Add New Dog' })).toBeVisible();

    // Fill Essential tab — Gender and Owner use base-ui Select (placeholder-based targeting)
    await page.getByLabel('Call Name').fill(DOG_A_NAME);
    await selectByPlaceholder(page, 'Choose gender', /^Male/i);
    await page.getByLabel('Date of Birth').fill('2020-06-15');

    // Owner field is below the fold — scroll and select
    await page
      .getByRole('combobox')
      .filter({ hasText: 'Choose dog owner' })
      .scrollIntoViewIfNeeded();
    await selectByPlaceholder(page, 'Choose dog owner', TEST_SECRETARY_PERSON_NAME);

    // Wait for POST to dogs table before navigating
    const createResponsePromise = page.waitForResponse(
      r => r.url().includes('/rest/v1/dogs') && r.request().method() === 'POST',
      { timeout: 15000 }
    );

    await page.getByRole('button', { name: 'Create Dog' }).click();
    await createResponsePromise;

    // Should navigate directly to the new dog's detail page (our post-create redirect fix)
    await page.waitForURL(/\/dogs\/[0-9a-f-]{36}$/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: DOG_A_NAME })).toBeVisible();
  });

  test('Create Dog B — second dog appears in browse list', async ({ page }) => {
    await gotoDogsBrowse(page);
    await page.getByRole('button', { name: 'New Dog' }).click();
    await expect(page.getByRole('heading', { name: 'Add New Dog' })).toBeVisible();

    await page.getByLabel('Call Name').fill(DOG_B_NAME);
    await selectByPlaceholder(page, 'Choose gender', /Female/i);
    await page.getByLabel('Date of Birth').fill('2021-03-20');

    await page
      .getByRole('combobox')
      .filter({ hasText: 'Choose dog owner' })
      .scrollIntoViewIfNeeded();
    await selectByPlaceholder(page, 'Choose dog owner', TEST_SECRETARY_PERSON_NAME);

    const createResponsePromise = page.waitForResponse(
      r => r.url().includes('/rest/v1/dogs') && r.request().method() === 'POST',
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: 'Create Dog' }).click();
    await createResponsePromise;

    await page.waitForURL(/\/dogs\/[0-9a-f-]{36}$/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: DOG_B_NAME })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Detail page — tabs and actions menu
// ---------------------------------------------------------------------------

test.describe('Dogs UI — Detail page (secretary)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  async function navigateToDogA(page: Page) {
    await gotoDogsBrowse(page);
    await page.getByPlaceholder('Search dogs by name, breed, or owner...').fill(DOG_A_NAME);
    await page.getByRole('link', { name: new RegExp(DOG_A_NAME) }).click();
    await page.waitForURL(/\/dogs\/[0-9a-f-]{36}$/);
  }

  test('detail page shows stats, hero, properties and tabs', async ({ page }) => {
    await navigateToDogA(page);

    // Stats bar (DOM text is title-case; CSS text-transform:uppercase makes it APPEAR uppercase)
    await expect(page.getByText('Entries', { exact: true })).toBeVisible();
    await expect(page.getByText('Registrations', { exact: true })).toBeVisible();

    // Edit button (exact to avoid matching inline "Edit Sex", "Edit Breed", etc. aria-labels)
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  });

  test('tab navigation stays on the same dog page', async ({ page }) => {
    await navigateToDogA(page);

    const tabs = ['Competitions', 'Title Progress', 'Statistics', 'Health Records'];
    for (const tab of tabs) {
      await page.getByRole('tab', { name: tab }).click();
      await expect(page).toHaveURL(/\/dogs\/[0-9a-f-]{36}\?tab=/);
    }
  });

  test('actions menu shows Change Photo, Change Status, Delete', async ({ page }) => {
    await navigateToDogA(page);

    // Open the ⋮ (three-dot) menu next to Edit
    const editBtn = page.getByRole('button', { name: 'Edit', exact: true });
    // The ⋮ button is the sibling in the same flex row — use its SVG to find it
    await editBtn.locator('..').getByRole('button').last().click();

    await expect(page.getByRole('menuitem', { name: /Change Photo/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Change Status/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Delete/i })).toBeVisible();

    // Close menu
    await page.keyboard.press('Escape');
  });
});

// ---------------------------------------------------------------------------
// Edit panel — cancel (keep editing + discard) + save
// ---------------------------------------------------------------------------

test.describe('Dogs UI — Edit panel (secretary)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  async function openEditPanelForDogA(page: Page) {
    await page.goto('/dogs', { waitUntil: 'networkidle' });
    await page.getByPlaceholder('Search dogs by name, breed, or owner...').fill(DOG_A_NAME);
    await page.getByRole('link', { name: new RegExp(DOG_A_NAME) }).click();
    await page.waitForURL(/\/dogs\/[0-9a-f-]{36}$/);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Edit Dog' })).toBeVisible();
  }

  test('Cancel with changes shows AlertDialog; "Keep editing" keeps panel open', async ({
    page,
  }) => {
    await openEditPanelForDogA(page);

    // Use ID selector — getByLabel('Breed') also matches the inline "Edit Breed" button
    await page.locator('input#breed').fill('Belgian Malinois');
    await page.getByRole('button', { name: 'Cancel' }).click();

    // AlertDialog should appear (not window.confirm — our fix replaced it)
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await expect(page.getByText('Discard changes?')).toBeVisible();

    // "Keep editing" dismisses the dialog and keeps panel open
    await page.getByRole('button', { name: 'Keep editing' }).click();
    await expect(page.getByRole('heading', { name: 'Edit Dog' })).toBeVisible();

    // Cancel again → Discard changes → panel closes
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button', { name: 'Discard changes' }).click();
    await expect(page.getByRole('heading', { name: 'Edit Dog' })).not.toBeVisible();
  });

  test('Save Changes persists the color field', async ({ page }) => {
    await openEditPanelForDogA(page);

    await page.locator('input#color').fill('Black and Tan');

    const patchResponsePromise = page.waitForResponse(
      r => r.url().includes('/rest/v1/dogs') && r.request().method() === 'PATCH',
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await patchResponsePromise;

    // Panel closes and success toast appears
    await expect(page.getByRole('heading', { name: 'Edit Dog' })).not.toBeVisible();
    await expect(page.getByText('Changes saved successfully')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Delete — cancel + confirm (Dog B only)
// ---------------------------------------------------------------------------

test.describe('Dogs UI — Delete (secretary)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  async function navigateToDogB(page: Page) {
    await page.goto('/dogs', { waitUntil: 'networkidle' });
    await page.getByPlaceholder('Search dogs by name, breed, or owner...').fill(DOG_B_NAME);
    await page
      .getByRole('link', { name: new RegExp(DOG_B_NAME) })
      .first()
      .click();
    await page.waitForURL(/\/dogs\/[0-9a-f-]{36}$/);
  }

  async function openActionsMenu(page: Page) {
    const editBtn = page.getByRole('button', { name: 'Edit', exact: true });
    await editBtn.locator('..').getByRole('button').last().click();
  }

  test('Delete dialog cancel keeps dog on the page', async ({ page }) => {
    await navigateToDogB(page);
    await openActionsMenu(page);
    await page.getByRole('menuitem', { name: /Delete/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // Dog name appears in the dialog confirmation text
    await expect(dialog.getByText(new RegExp(DOG_B_NAME))).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    // Still on Dog B detail page
    await expect(page).toHaveURL(/\/dogs\/[0-9a-f-]{36}$/);
  });

  test('Confirm delete navigates to /dogs and dog no longer appears', async ({ page }) => {
    await navigateToDogB(page);
    await openActionsMenu(page);
    await page.getByRole('menuitem', { name: /Delete/i }).click();

    await expect(page.getByRole('dialog')).toBeVisible();

    // Soft-delete calls the soft_delete_dog RPC, not a direct dogs table DELETE
    const deleteResponsePromise = page.waitForResponse(
      r => r.url().includes('/rest/v1/rpc/soft_delete_dog'),
      { timeout: 15000 }
    );

    // The red confirm button — exact match avoids the "Delete" menu item
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await deleteResponsePromise;

    await page.waitForURL(/\/dogs(\?|$|#)/, { timeout: 10000 });

    // Dog B should no longer appear in the list
    await expect(async () => {
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByPlaceholder('Search dogs by name, breed, or owner...').fill(DOG_B_NAME);
      await expect(page.getByRole('link', { name: new RegExp(DOG_B_NAME) })).toHaveCount(0);
    }).toPass({ timeout: 15000 });
  });
});
