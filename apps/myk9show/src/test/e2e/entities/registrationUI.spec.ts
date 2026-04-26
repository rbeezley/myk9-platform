import { test, expect, Page } from '@playwright/test';

/**
 * UI test for the secretary mail-in registration wizard.
 *
 * Walks /secretary/register/:showId as a secretary in mail-in mode and covers:
 *   - The secretary-mode UI shape (advanced dog search visible, "Step 1 of 5").
 *   - Validation gating (Next disabled with no dog selected).
 *   - Server-side dog search returning dogs the secretary does NOT own
 *     (regression guard for 2026-04-23 commit 08294440).
 *
 * Auth: secretary@myk9t.com / testpass123
 *
 * Open finding (test.fixme below): the wizard's submit step calls
 * createShowRegistration with handler_id = secretary.auth.user.id, which fails
 * RLS on `enrollments` and is semantically wrong for mail-in (the registration
 * should be filed under the dog's owner, not the secretary). The full happy
 * path through the entries list and DB-fee verification is gated on that fix.
 *
 * Out of scope (require multi-user / role-swap fixtures):
 *   - currentWorkflowMode reset on role change
 *   - draft cross-user scoping leakage
 */

test.describe.configure({ mode: 'serial' });

const SECRETARY_EMAIL = 'secretary@myk9t.com';
const SECRETARY_PASSWORD = 'testpass123';

// Seeded "June 2026" AKC Scent Work show — entry close 2026-06-13.
// Trial "Saturday Trial 1" with Interior element classes ($30 each).
const SHOW_ID = '4584f257-19b5-4016-aae6-5e7827b769cb';

// Search term that matches a non-owned dog (regression guard for 08294440).
// "Bravo" is seeded with owner_id = dedd1ebc... (not the secretary).
const NON_OWNED_DOG_SEARCH = 'Bravo';

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

async function gotoRegistrationWizard(page: Page) {
  await page.goto(`/secretary/register/${SHOW_ID}`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Register for Show' })).toBeVisible({
    timeout: 15000,
  });
}

/**
 * Capture: secretary owns 0 dogs in the seeded DB. Without the
 * server-side searchAllDogs path, the dog list is empty and the wizard
 * can't progress. If this assertion fails, commit 08294440 has regressed
 * and a secretary cannot register a mail-in entry.
 */
async function searchAndSelectFirstDog(page: Page, query: string) {
  const search = page.getByPlaceholder(/Search all dogs/i);
  await expect(search).toBeVisible();
  await search.fill(query);

  // searchAllDogs is debounced 300ms; the underlying REST call is GET /rest/v1/dogs.
  // Wait for the response so we don't race the virtual list rendering.
  await page.waitForResponse(
    resp =>
      resp.url().includes('/rest/v1/dogs') &&
      resp.request().method() === 'GET' &&
      resp.url().toLowerCase().includes(query.toLowerCase()),
    { timeout: 10000 }
  );

  // The dog list is virtualized (react-window); rows render as <div> with a
  // Checkbox + name. Click the first eligible checkbox.
  const firstCheckbox = page
    .locator('[role="checkbox"]')
    .filter({ hasNotText: /select all/i })
    .first();
  await expect(firstCheckbox).toBeVisible({ timeout: 5000 });
  await firstCheckbox.click();
}

test.describe('Registration Wizard — Browse + RBAC guard', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  test('renders secretary-mode wizard with advanced dog search', async ({ page }) => {
    await gotoRegistrationWizard(page);

    // Step indicator: Select Dogs is the first step for secretaries (exhibitors skip it).
    // The "Step 1 of 5" text appears in two places (vertical sidebar + main content
    // header); .first() matches either reliably.
    await expect(page.getByText(/Step 1 of 5/).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Select Dogs to Register' })).toBeVisible();

    // advancedSearch flag → "Search all dogs..." placeholder is present.
    // (Bulk Select / Create New buttons render conditionally on visibleDogs.length;
    // exercised in the search-and-select test below, not here.)
    await expect(page.getByPlaceholder(/Search all dogs/i)).toBeVisible();
  });

  test('Next button is disabled until a dog is selected', async ({ page }) => {
    await gotoRegistrationWizard(page);
    // canProceed() returns false until selectedDogs.length > 0
    await expect(page.getByRole('button', { name: /^Next/ })).toBeDisabled();
  });

  test('searches for a non-owned dog and finds results (08294440 regression)', async ({ page }) => {
    await gotoRegistrationWizard(page);
    const search = page.getByPlaceholder(/Search all dogs/i);
    await search.fill(NON_OWNED_DOG_SEARCH);

    // Server-side search returns dogs whose owner_id is NOT the secretary's.
    // Wait for the actual REST response.
    await page.waitForResponse(
      resp =>
        resp.url().includes('/rest/v1/dogs') &&
        resp.request().method() === 'GET' &&
        resp.url().toLowerCase().includes('bravo'),
      { timeout: 10000 }
    );

    // The "X dog(s)" counter in the actions bar updates to a non-zero value.
    await expect(page.getByText(/^\d+ dogs?/)).toBeVisible();
    // And the empty-state message is NOT shown.
    await expect(page.getByText(/No dogs match your search/i)).not.toBeVisible();
  });
});

test.describe('Registration Wizard — Mail-in entry happy path', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  // FIXME (2026-04-26 walk): the wizard's submit step calls
  // createShowRegistration(showId, userId=secretary.auth.id) — but for a
  // mail-in entry the handler_id should be the *dog's owner's* people.id,
  // not the secretary's auth.user.id. The current call:
  //   1. Fails RLS on `enrollments` insert (the secretary user has no row in
  //      the `people` table that handler_id can reference, and no policy
  //      allows them to enroll on behalf of others).
  //   2. Is semantically wrong even when allowed (the registration would
  //      appear under the secretary, not the exhibitor receiving the entry).
  // The whole 5-step happy path through to the entries list is gated on
  // fixing this. Tracked separately — see spawned follow-up task.
  test.fixme('submits a 2-class mail-in entry with secretary_paid method', async ({ page }) => {
    await gotoRegistrationWizard(page);

    // ─── Step 1: Select a non-owned dog via search ─────────────────────────
    await searchAndSelectFirstDog(page, NON_OWNED_DOG_SEARCH);

    // The selection counter shows "1 selected".
    await expect(page.getByText(/1 selected/)).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: /^Next/ }).click();

    // ─── Step 2: Class selection (per-dog tab) ─────────────────────────────
    await expect(page.getByRole('heading', { name: 'Select Classes' })).toBeVisible();

    // The Interior element card lists 5 level chips (Novice A/B, Advanced,
    // Excellent, Master). Click Novice A and Excellent — both at $30.
    // The chip is a <label class="myk9-level-chip"> wrapping a checkbox + label text.
    const interiorCard = page.locator('.myk9-element-card').filter({ hasText: 'Interior' }).first();
    await expect(interiorCard).toBeVisible();

    await interiorCard.locator('label.myk9-level-chip').filter({ hasText: 'Novice A' }).click();
    await interiorCard.locator('label.myk9-level-chip').filter({ hasText: 'Excellent' }).click();

    // The trial section header shows "2 selected" once both are chosen.
    await expect(page.getByText(/2 selected/).first()).toBeVisible();

    await page.getByRole('button', { name: /^Next/ }).click();

    // ─── Step 3: Handler assignment (auto-assigned to dog owner) ───────────
    // smartDefaults.autoAssignHandler = true for secretary roles, so the
    // alert reads "All entries have handlers assigned."
    await expect(page.getByText(/All entries have handlers assigned/i)).toBeVisible({
      timeout: 5000,
    });

    await page.getByRole('button', { name: /^Next/ }).click();

    // ─── Step 4: Payment ───────────────────────────────────────────────────
    await expect(page.getByRole('heading', { name: 'Payment Information' })).toBeVisible();

    // Fee=0 fallback regression guard (PR #75): the show's pre_entry_fee is $10
    // and the seeded show's startDate is 2026-06-13, so getShowEntryFee returns
    // $10/class (not the class-level $30). With 2 classes the subtotal is $20
    // and the early-bird-discounted Total Due is $19. The exact value isn't the
    // point — what matters is the line shows a real positive amount, never $0.
    const totalDueRow = page.getByText('Total Due').locator('..');
    await expect(totalDueRow).toBeVisible({ timeout: 5000 });
    await expect(totalDueRow).not.toContainText('$0.00');
    await expect(totalDueRow).toContainText(/\$\d+\.\d{2}/);

    // Pick Secretary Payment (Already Received) — only visible to roles with
    // REGISTRATION_PERMISSIONS.MARK_PAYMENT (regression guard for the secretary
    // role default fix in this PR).
    await page.getByRole('button', { name: /Secretary Payment \(Already Received\)/i }).click();

    // The show is AKC-organized → entry agreement is required. The label is
    // associated with the checkbox via htmlFor="entry-agreement"; clicking the
    // text toggles the checkbox.
    await page.getByText(/I have read and agree to the .* entry agreement above/i).click();

    // ─── Submit: wait for the submit_show_entries RPC ──────────────────────
    const rpcPromise = page.waitForResponse(
      resp =>
        resp.url().includes('/rest/v1/rpc/submit_show_entries') &&
        resp.request().method() === 'POST',
      { timeout: 30000 }
    );
    await page.getByRole('button', { name: /^Next/ }).click();
    const rpcResponse = await rpcPromise;
    expect(rpcResponse.status()).toBeGreaterThanOrEqual(200);
    expect(rpcResponse.status()).toBeLessThan(300);

    // ─── Step 5: Confirmation ──────────────────────────────────────────────
    await expect(page.getByRole('heading', { name: /Registration Confirmed!/i })).toBeVisible({
      timeout: 15000,
    });
    // Confirmation # badge is rendered with the registration number.
    await expect(page.getByText(/Confirmation #:/i)).toBeVisible();

    // Capture the dog row text so the entries-list test can locate it.
    // Use the "Registered Dogs & Classes" section heading as the anchor.
    await expect(page.getByText(/Registered Dogs & Classes/i)).toBeVisible();
  });
});

test.describe('Registration Wizard — Entries appear in management list', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  // FIXME — gated on the same mail-in enrollment fix as the happy path above.
  // Once createShowRegistration accepts a per-entry exhibitor handler_id (or
  // some other handler-on-behalf-of mechanism), this test can be enabled.
  test.fixme('newly-created entries land on /secretary/entries?showId=...&tab=entries', async ({
    page,
  }) => {
    // Filter the entries page to the seeded show. The route accepts showId in
    // the query string; the page's <ShowPicker> sets it from there too.
    await page.goto(`/secretary/entries/${SHOW_ID}?tab=entries`, { waitUntil: 'networkidle' });

    // Header heading is rendered by EntryManagementPage.
    await expect(page.getByText(/Manage show entries/i)).toBeVisible({ timeout: 15000 });

    // The entries table/list should render at least the "Bravo" entry we
    // just created (or any other prior entry — this assertion is resilient
    // against re-runs by checking for ANY entry, not a specific armband).
    await expect(page.getByText(/Bravo/i).first()).toBeVisible({ timeout: 15000 });
  });

  // FIXME — same gate as above.
  test.fixme('DB query confirms entries carry non-zero entry_fee (PR #75 regression guard)', async ({
    page,
  }) => {
    // After the wizard runs, query Supabase from the page context (already
    // authenticated as secretary) and assert the latest entry on this show
    // has entry_fee > 0. A $0 fallback bug would be silent in the UI.
    const latestEntry = await page.evaluate(async (showId: string) => {
      // The auth session is in localStorage under the supabase key.
      const supabaseKey = Object.keys(localStorage).find(k => k.startsWith('sb-'));
      const session = supabaseKey ? JSON.parse(localStorage.getItem(supabaseKey) || '{}') : {};
      const token = session?.access_token;
      if (!token) return { ok: false, reason: 'no auth token' };

      // Vite injects VITE_SUPABASE_URL / _ANON_KEY into import.meta.env at build
      // time; in the running app they're already in use by the supabase client,
      // so we can pull them from the existing fetch endpoint by reading any
      // `<link rel>` with the URL or by parsing the script. Easier: hit the
      // same origin's known supabase URL via the global supabase client if it's
      // exposed. As a fallback, just read from import.meta if the dev build
      // exposes it.
      // Pragmatic path: find the URL by inspecting an existing fetch (the page
      // has already made REST calls). We'll grab it from the meta env via window.
      const env = (window as unknown as { __ENV?: Record<string, string> }).__ENV;
      const supabaseUrl =
        env?.VITE_SUPABASE_URL ??
        document
          .querySelector<HTMLMetaElement>('meta[name="supabase-url"]')
          ?.getAttribute('content') ??
        // Fallback to the known prod project ref from .env (this app uses one project).
        'https://sojmvhhwsjxmfistvzbe.supabase.co';
      const anonKey =
        env?.VITE_SUPABASE_ANON_KEY ??
        document
          .querySelector<HTMLMetaElement>('meta[name="supabase-anon-key"]')
          ?.getAttribute('content') ??
        '';

      const url = `${supabaseUrl}/rest/v1/entries?show_id=eq.${showId}&select=id,entry_fee,payment_status&order=submitted_at.desc.nullslast&limit=1`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(anonKey ? { apikey: anonKey } : {}),
        },
      });
      if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
      const rows = (await res.json()) as Array<{
        id: string;
        entry_fee: number | null;
        payment_status: string;
      }>;
      return { ok: true, rows };
    }, SHOW_ID);

    expect(
      latestEntry.ok,
      latestEntry.ok ? '' : `entries query failed: ${latestEntry.reason}`
    ).toBe(true);
    if (latestEntry.ok && latestEntry.rows && latestEntry.rows.length > 0) {
      const row = latestEntry.rows[0]!;
      // Either the per-class fee ($30) or the registration aggregate — must be > 0.
      expect(Number(row.entry_fee ?? 0)).toBeGreaterThan(0);
    }
  });
});
