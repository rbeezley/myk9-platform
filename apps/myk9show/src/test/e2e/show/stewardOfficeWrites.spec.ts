import { expect, test, type Page } from '@playwright/test';
import { signIn, signInAsSecretary } from '../helpers/testUsers';
import {
  getIsolatedAdminClient,
  isIsolatedTarget,
  readReplicationStoreCount,
} from '../helpers/isolatedFixtures';

/**
 * Suite category: regression (isolated only).
 *
 * MYK9-147. A steward runs the ring (check-in) but must not administer the
 * office: no judge-assignment or enrollment writes. `secretary@` holds steward
 * AND secretary, so it cannot show a denial; this spec mints a disposable
 * steward-only account through the local auth admin API and deletes it after.
 *
 * The office writes go straight to PostgREST with the steward's own session, the
 * path the original finding used. RLS filters them to zero rows. The positive
 * control sends the same PATCHes as secretary@ and must change one row each, so
 * a probe that could never succeed cannot pass as a denial.
 */

const SUPABASE = process.env.VITE_SUPABASE_URL ?? '';
const ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SHOW_ID = 'dededede-0000-0000-0000-000000000010';
const CLUB_ID = 'dededede-0000-0000-0000-000000000001';
const JUDGE_ASSIGNMENT_ID = 'dededede-0000-0000-0000-0000000000b5';
const ENROLLMENT_ID = 'dededede-0000-0000-0000-000000000070';
// Exterior Excellent: unscored on the seed, with "Juni" unique and near the top of the list.
const RING_CLASS_ID = 'dec1a55e-0000-0000-0000-000000000033';
const RING_DOG = 'Juni';
const SCORE_CLASS_ID = 'dec1a55e-0000-0000-0000-000000000031';
const SCORE_ENTRY_ID = 'dededede-0000-0000-0000-000000000051';

test.describe.configure({ mode: 'serial' });
test.skip(!isIsolatedTarget(), 'mints a disposable account: isolated Supabase target only');

interface Steward {
  authUserId: string;
  email: string;
  password: string;
}

async function createStewardOnlyAccount(): Promise<Steward> {
  const client = getIsolatedAdminClient();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const email = `e2e-steward-${suffix}@myk9t.test`;
  const password = `Steward-${suffix}-Aa1!`;
  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: 'Disposable', last_name: 'Steward' },
  });
  if (error || !data.user) throw new Error(`Could not create steward: ${error?.message}`);
  const authUserId = data.user.id;

  // The signup trigger creates the person; user_roles.user_id is that person's id.
  let personId = '';
  await expect
    .poll(
      async () => {
        const { data: person } = await client
          .from('people')
          .select('id')
          .eq('auth_user_id', authUserId)
          .maybeSingle();
        personId = person?.id ?? '';
        return personId;
      },
      { timeout: 15_000, message: 'signup trigger created no person' }
    )
    .not.toBe('');

  const { data: role, error: roleError } = await client
    .from('roles')
    .select('id')
    .eq('name', 'steward')
    .single();
  if (roleError || !role) throw new Error(`No steward role: ${roleError?.message}`);
  const { error: grantError } = await client.from('user_roles').insert({
    user_id: personId,
    auth_user_id: authUserId,
    role_id: role.id,
    club_id: CLUB_ID,
    is_active: true,
  });
  if (grantError) throw new Error(`Could not grant steward: ${grantError.message}`);
  return { authUserId, email, password };
}

async function deleteAccount(steward: Steward) {
  const client = getIsolatedAdminClient();
  await client.from('people').delete().eq('auth_user_id', steward.authUserId);
  const { error } = await client.auth.admin.deleteUser(steward.authUserId);
  if (error) throw new Error(`Could not delete steward: ${error.message}`);
}

async function accessToken(page: Page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => /^sb-.*-auth-token$/.test(k));
    return key ? (JSON.parse(localStorage.getItem(key) ?? '{}').access_token as string) : '';
  });
}

/** PATCH with the signed-in user's own session; returns the status and rows changed. */
async function patchAsSignedIn(page: Page, path: string, body: Record<string, unknown>) {
  const token = await accessToken(page);
  expect(token, 'no session token').not.toBe('');
  const res = await page.request.patch(`${SUPABASE}/rest/v1/${path}`, {
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    data: body,
  });
  const parsed: unknown = await res.json().catch(() => null);
  return { status: res.status(), rows: Array.isArray(parsed) ? parsed.length : -1 };
}

/** Sets the dog's check-in from its own control on the ringside class list. */
async function setCheckIn(page: Page, from: RegExp, option: RegExp, to: RegExp) {
  const control = (state: RegExp) =>
    page.getByRole('button', {
      name: new RegExp(`^Check-in: ${state.source}\\. Change check-in for ${RING_DOG}$`),
    });
  await control(from).click();
  await page
    .locator('[role=menu], [role=dialog], [role=listbox]')
    .getByText(option)
    .first()
    .click();
  await expect(control(to)).toBeVisible({ timeout: 15_000 });
}

test('a steward-only account checks dogs in but cannot write office records', async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  const steward = await createStewardOnlyAccount();
  const ringWrites: number[] = [];
  page.on('response', r => {
    if (r.url().includes('/rest/v1/rpc/ringside_update_entry')) ringWrites.push(r.status());
  });
  try {
    await signIn(
      page,
      steward.email,
      steward.password,
      `/at-show/${SHOW_ID}/class/${RING_CLASS_ID}`
    );

    // Scoring is a judge capability: the steward is sent to a judge passcode.
    await page.goto(`/at-show/${SHOW_ID}/class/${SCORE_CLASS_ID}/score/${SCORE_ENTRY_ID}`);
    await expect(page.getByText('No Scoring Access')).toBeVisible({ timeout: 30_000 });

    // Ring flow, online.
    await page.goto(`/at-show/${SHOW_ID}/class/${RING_CLASS_ID}`);
    await setCheckIn(page, /Not checked in/, /^Checked[ -]in$/i, /Checked in/);
    await expect.poll(() => ringWrites.length, { timeout: 30_000 }).toBeGreaterThan(0);
    await expect
      .poll(() => readReplicationStoreCount(page, 'pending_mutations'), { timeout: 30_000 })
      .toBe(0);

    // Office writes with the steward's own session: RLS leaves zero rows changed.
    const assignment = await patchAsSignedIn(
      page,
      `judge_assignments?id=eq.${JUDGE_ASSIGNMENT_ID}`,
      {
        status: 'confirmed',
      }
    );
    const enrollment = await patchAsSignedIn(page, `enrollments?id=eq.${ENROLLMENT_ID}`, {
      notes: 'MYK9-147 regression probe',
    });
    expect(assignment.status >= 400 || assignment.rows === 0, JSON.stringify(assignment)).toBe(
      true
    );
    expect(enrollment.status >= 400 || enrollment.rows === 0, JSON.stringify(enrollment)).toBe(
      true
    );

    // No office controls on the show home.
    await page.goto(`/shows/${SHOW_ID}?select=classes`);
    await page.waitForTimeout(6_000);
    await expect(
      page.getByRole('button', { name: /^Assign judge|^Trial actions|^Add classes/ })
    ).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: /^Select every class/ })).toHaveCount(0);

    // Ring flow, offline: undo the check-in, which also puts the seed back.
    await page.goto(`/at-show/${SHOW_ID}/class/${RING_CLASS_ID}`);
    await expect(page.getByRole('button', { name: /^Pending/ })).toBeVisible({ timeout: 30_000 });
    const before = ringWrites.length;
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    // The dialog names the reset "No Status" (statusIconGrammar); the control then reads "Not checked in".
    await setCheckIn(page, /Checked in/, /^No Status$/, /Not checked in/);
    await expect
      .poll(() => readReplicationStoreCount(page, 'pending_mutations'), { timeout: 15_000 })
      .toBeGreaterThan(0);
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect
      .poll(() => readReplicationStoreCount(page, 'pending_mutations'), { timeout: 60_000 })
      .toBe(0);
    const drained = ringWrites.slice(before);
    expect(drained.length).toBeGreaterThan(0);
    expect(drained.every(s => s >= 200 && s < 300)).toBe(true);
  } finally {
    await context.setOffline(false);
    await deleteAccount(steward);
  }
});

test('control: the same office writes change one row each for secretary@', async ({ page }) => {
  await signInAsSecretary(page, `/shows/${SHOW_ID}`);
  const assignment = await patchAsSignedIn(page, `judge_assignments?id=eq.${JUDGE_ASSIGNMENT_ID}`, {
    status: 'confirmed',
  });
  const { data: before } = await getIsolatedAdminClient()
    .from('enrollments')
    .select('notes')
    .eq('id', ENROLLMENT_ID)
    .single();
  const enrollment = await patchAsSignedIn(page, `enrollments?id=eq.${ENROLLMENT_ID}`, {
    notes: before?.notes ?? null,
  });
  expect(assignment).toEqual({ status: 200, rows: 1 });
  expect(enrollment).toEqual({ status: 200, rows: 1 });
});
