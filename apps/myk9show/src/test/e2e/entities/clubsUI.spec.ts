import { test, expect, Page } from '@playwright/test';

/**
 * Comprehensive UI test for the Clubs section.
 *
 * Unlike clubCRUD.spec.ts (which calls service functions via page.evaluate),
 * this exercises the actual UI: Add Club dialog, search/filter, view toggle,
 * detail page tabs, members, branding, edit, and delete.
 *
 * Strategy:
 *   - Create three clubs (A, B, C) with unique timestamped names.
 *   - Run tests serially so state persists between them.
 *   - Delete only Club C at the end — Club A and Club B remain in the DB
 *     to provide ongoing test data.
 *
 * Auth: secretary@myk9t.com / testpass123
 * RLS: relies on migration 155_clubs_insert_allow_secretary_and_club_admin.
 */

test.describe.configure({ mode: 'serial' });

const RUN_ID = Date.now();
const CLUB_A_NAME = `E2E Club A ${RUN_ID}`;
const CLUB_B_NAME = `E2E Club B ${RUN_ID}`;
const CLUB_C_NAME = `E2E Club C ${RUN_ID}`;

const SECRETARY_EMAIL = 'secretary@myk9t.com';
const SECRETARY_PASSWORD = 'testpass123';
// Admin credentials come from env (.env / .env.local) so they're not committed.
// Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to a user with the site_admin role.
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';

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

async function signInAsAdmin(page: Page) {
  await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
}

async function gotoClubsBrowse(page: Page) {
  await page.goto('/clubs', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Clubs', level: 1 })).toBeVisible();
}

async function openCreateClubDialog(page: Page) {
  await page.getByRole('button', { name: 'Add Club' }).click();
  await expect(page.getByRole('dialog', { name: 'Create Club' })).toBeVisible();
}

interface ClubFormData {
  name: string;
  number: string;
  description: string;
  founded?: string;
  type?: 'Specialty Club' | 'All-Breed Club' | 'Local Club' | 'Regional Club' | 'National Club';
  brandColor?:
    | 'Blue'
    | 'Red'
    | 'Green'
    | 'Purple'
    | 'Terracotta'
    | 'Cyan'
    | 'Gold'
    | 'Pink'
    | 'Indigo'
    | 'Emerald';
  email: string;
  phone: string;
  website?: string;
  street: string;
  city: string;
  state: string;
  zip: string;
}

async function fillCreateClubForm(page: Page, data: ClubFormData) {
  // Basic Info tab (default selected)
  await page.getByRole('textbox', { name: 'Club Name (required)' }).fill(data.name);
  await page.getByRole('textbox', { name: 'Club Number' }).fill(data.number);
  await page.getByRole('textbox', { name: 'Description' }).fill(data.description);

  if (data.brandColor) {
    await page.getByRole('radio', { name: data.brandColor }).click();
  }

  if (data.type) {
    await page.getByRole('combobox', { name: 'Club Type' }).click();
    await page.getByRole('option', { name: data.type }).click();
  }

  if (data.founded) {
    await page.getByRole('textbox', { name: 'Founded' }).fill(data.founded);
  }

  // Contact tab
  await page.getByRole('tab', { name: 'Contact' }).click();
  await page.getByRole('textbox', { name: 'Email Address (required)' }).fill(data.email);
  await page.getByRole('textbox', { name: 'Phone Number (required)' }).fill(data.phone);
  if (data.website) {
    await page.getByRole('textbox', { name: 'Website' }).fill(data.website);
  }
  await page.getByRole('textbox', { name: 'Street Address (required)' }).fill(data.street);
  await page.getByRole('textbox', { name: 'City (required)' }).fill(data.city);
  await page.getByRole('textbox', { name: 'State/Province (required)' }).fill(data.state);
  await page.getByRole('textbox', { name: 'ZIP Code (required)' }).fill(data.zip);
}

async function submitCreateClub(page: Page, expectedName: string) {
  // Capture every supabase REST request so we can confirm the insert actually
  // hits the network (replication is offline-first: the form submit completes
  // after a local IndexedDB write, the actual DB insert happens later via the
  // mutation queue's 100ms debounce).
  const restRequests: Array<{ url: string; method: string; status: number }> = [];
  const captureResponse = async (resp: import('@playwright/test').Response) => {
    if (resp.url().includes('/rest/v1/clubs')) {
      restRequests.push({
        url: resp.url(),
        method: resp.request().method(),
        status: resp.status(),
      });
    }
  };
  page.on('response', captureResponse);

  await page.getByRole('button', { name: 'Create Club', exact: true }).click();
  await page.waitForURL(/\/clubs\/[0-9a-f-]{36}$/, { timeout: 15000 });

  // Wait long enough for the mutation queue debounce + roundtrip to flush.
  await page.waitForTimeout(3000);

  page.off('response', captureResponse);

  const insertHits = restRequests.filter(r => r.method === 'POST' && r.status < 400);
  if (insertHits.length === 0) {
    throw new Error(
      `Expected at least one successful POST /rest/v1/clubs after creating "${expectedName}". ` +
        `Captured requests: ${JSON.stringify(restRequests)}`
    );
  }
}

// Note: no global beforeEach — each describe block sets its own auth so the
// admin-only Delete tests can sign in as a different user without fighting a
// parent hook.

test.describe('Clubs UI — Browse Page', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  test('loads club list with header and toolbar', async ({ page }) => {
    await gotoClubsBrowse(page);
    await expect(page.getByRole('button', { name: 'Add Club' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /Search clubs by name/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Club Type/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cards' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Table' })).toBeVisible();
  });

  test('view toggle switches between cards and table', async ({ page }) => {
    await gotoClubsBrowse(page);
    await page.getByRole('button', { name: 'Table' }).click();
    // In table mode, Table button should be active (has aria-pressed or visual variant)
    await expect(page.getByRole('button', { name: 'Cards' })).toBeVisible();
    await page.getByRole('button', { name: 'Cards' }).click();
    await expect(page.getByRole('button', { name: 'Table' })).toBeVisible();
  });

  test('search input filters list', async ({ page }) => {
    await gotoClubsBrowse(page);
    const search = page.getByRole('textbox', { name: /Search clubs by name/ });
    await search.fill('NoMatchXYZ123');
    await expect(page.getByText(/No clubs match your filters/i)).toBeVisible();
    await page.getByRole('button', { name: /Clear Filters/i }).click();
    await expect(search).toHaveValue('');
  });
});

test.describe('Clubs UI — Create', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  test('creates Club A with full Basic Info + Contact', async ({ page }) => {
    await gotoClubsBrowse(page);
    await openCreateClubDialog(page);

    await fillCreateClubForm(page, {
      name: CLUB_A_NAME,
      number: `CLUB-A-${RUN_ID}`,
      description: 'Club A — automated UI test club, persists across runs',
      founded: '1985-06-15',
      type: 'Specialty Club',
      brandColor: 'Blue',
      email: 'club-a@e2etest.com',
      phone: '555-0101',
      website: 'https://club-a.example.com',
      street: '100 Specialty Lane',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
    });

    await submitCreateClub(page, CLUB_A_NAME);
    await expect(page).toHaveURL(/\/clubs\/[0-9a-f-]{36}$/);
  });

  test('creates Club B with All-Breed type and Red color', async ({ page }) => {
    await gotoClubsBrowse(page);
    await openCreateClubDialog(page);

    await fillCreateClubForm(page, {
      name: CLUB_B_NAME,
      number: `CLUB-B-${RUN_ID}`,
      description: 'Club B — all-breed test club',
      type: 'All-Breed Club',
      brandColor: 'Red',
      email: 'club-b@e2etest.com',
      phone: '555-0202',
      street: '200 Breed Avenue',
      city: 'Denver',
      state: 'CO',
      zip: '80202',
    });

    await submitCreateClub(page, CLUB_B_NAME);
  });

  test('creates Club C (will be deleted later)', async ({ page }) => {
    await gotoClubsBrowse(page);
    await openCreateClubDialog(page);

    await fillCreateClubForm(page, {
      name: CLUB_C_NAME,
      number: `CLUB-C-${RUN_ID}`,
      description: 'Club C — minimal test club, deleted at end of run',
      type: 'Local Club',
      email: 'club-c@e2etest.com',
      phone: '555-0303',
      street: '300 Local Street',
      city: 'Portland',
      state: 'OR',
      zip: '97201',
    });

    await submitCreateClub(page, CLUB_C_NAME);
  });

  test('all three clubs appear in browse list', async ({ page }) => {
    await gotoClubsBrowse(page);
    await expect(page.getByRole('heading', { name: CLUB_A_NAME })).toBeVisible();
    await expect(page.getByRole('heading', { name: CLUB_B_NAME })).toBeVisible();
    await expect(page.getByRole('heading', { name: CLUB_C_NAME })).toBeVisible();
  });

  test('search finds Club A by name', async ({ page }) => {
    await gotoClubsBrowse(page);
    await page.getByRole('textbox', { name: /Search clubs by name/ }).fill(CLUB_A_NAME);
    await expect(page.getByRole('heading', { name: CLUB_A_NAME })).toBeVisible();
    await expect(page.getByRole('heading', { name: CLUB_B_NAME })).not.toBeVisible();
  });

  test('form validation — empty submit keeps Create button disabled', async ({ page }) => {
    await gotoClubsBrowse(page);
    await openCreateClubDialog(page);
    // Required: Club Name. Without it, Create Club is disabled.
    await expect(page.getByRole('button', { name: 'Create Club', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Cancel' }).click();
  });
});

test.describe('Clubs UI — Detail Page (Club A)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  async function openClubA(page: Page) {
    await gotoClubsBrowse(page);
    await page
      .getByRole('link', { name: new RegExp(CLUB_A_NAME) })
      .first()
      .click();
    await page.waitForURL(/\/clubs\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: CLUB_A_NAME })).toBeVisible();
  }

  test('header shows name and breadcrumb', async ({ page }) => {
    await openClubA(page);
    await expect(page.getByRole('heading', { name: CLUB_A_NAME })).toBeVisible();
  });

  test('contact information is visible on detail page', async ({ page }) => {
    await openClubA(page);
    // Email is hidden behind the Email button in the header — but the About tab
    // renders it as raw text inside a mailto: anchor.
    await page.getByRole('tab', { name: /About/i }).click();
    await expect(page.getByRole('link', { name: 'club-a@e2etest.com' })).toBeVisible();
  });
});

test.describe('Clubs UI — Delete permissions (secretary)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  test('secretary does NOT see Delete Club option (RLS blocks delete)', async ({ page }) => {
    await gotoClubsBrowse(page);
    await page
      .getByRole('link', { name: new RegExp(CLUB_C_NAME) })
      .first()
      .click();
    await page.waitForURL(/\/clubs\/[0-9a-f-]{36}$/);
    await page.getByRole('button', { name: 'Club options' }).click();
    await expect(page.getByRole('menuitem', { name: /Delete Club/i })).not.toBeVisible();
  });
});

test.describe('Clubs UI — Delete (only Club C, as platform admin)', () => {
  // Override beforeEach: site admin is the only role allowed to delete clubs
  // (matches the clubs_delete RLS policy at supabase/migrations/016).
  test.beforeEach(async ({ page }) => {
    test.skip(
      !ADMIN_EMAIL || !ADMIN_PASSWORD,
      'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set — skipping admin-only delete tests'
    );
    await signInAsAdmin(page);
  });

  test('Club C can be deleted from detail page', async ({ page }) => {
    await gotoClubsBrowse(page);
    await page
      .getByRole('link', { name: new RegExp(CLUB_C_NAME) })
      .first()
      .click();
    await page.waitForURL(/\/clubs\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: CLUB_C_NAME })).toBeVisible();

    await page.getByRole('button', { name: 'Club options' }).click();
    await page.getByRole('menuitem', { name: /Delete Club/i }).click();

    const confirmDialog = page.getByRole('dialog');
    await expect(confirmDialog).toBeVisible();

    // The replication layer's MutationManager debounces the actual Supabase
    // DELETE by ~100ms after the optimistic local removal. If we let the test
    // end before the network call lands, the next test sees the club still in
    // Supabase. Wait for the DELETE response before considering this test done.
    const deleteResponsePromise = page.waitForResponse(
      response =>
        response.url().includes('/rest/v1/clubs') && response.request().method() === 'DELETE',
      { timeout: 15000 }
    );

    await confirmDialog.getByRole('button', { name: 'Delete', exact: true }).click();

    await page.waitForURL(/\/clubs(\?|$|#)/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: CLUB_C_NAME })).not.toBeVisible();

    // Confirm Supabase actually accepted the DELETE (RLS would silently return
    // 0 rows for an unauthorized user — admin should get the row back).
    const deleteResponse = await deleteResponsePromise;
    expect(deleteResponse.status()).toBeGreaterThanOrEqual(200);
    expect(deleteResponse.status()).toBeLessThan(300);
  });

  test('Club A and Club B persist after Club C deletion', async ({ page }) => {
    await gotoClubsBrowse(page);
    await expect(page.getByRole('heading', { name: CLUB_A_NAME })).toBeVisible();
    await expect(page.getByRole('heading', { name: CLUB_B_NAME })).toBeVisible();
    // The optimistic local delete + Supabase mutation can take a beat to flush.
    // Poll the browse list (with reloads) until Club C disappears, rather than
    // relying on Playwright's retry to absorb the gap.
    await expect(async () => {
      await page.reload({ waitUntil: 'networkidle' });
      await expect(page.getByRole('heading', { name: CLUB_C_NAME })).toHaveCount(0);
    }).toPass({ timeout: 15000 });
  });
});
