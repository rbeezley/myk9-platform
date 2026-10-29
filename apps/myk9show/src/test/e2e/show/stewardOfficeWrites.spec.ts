import { expect, test, type Page } from '@playwright/test';
import { signIn, signInAsSecretary } from '../helpers/testUsers';
import {
  cleanupDisposableEntry,
  getIsolatedAdminClient,
  isIsolatedTarget,
  readReplicationStoreCount,
  seedDisposableEntry,
  type DisposableEntry,
} from '../helpers/isolatedFixtures';

/**
 * Suite category: regression (isolated only).
 *
 * MYK9-147. A steward runs the ring (check-in) but must not administer the
 * office: no judge-assignment or enrollment writes. `secretary@` holds steward
 * AND secretary, so it cannot show a denial; this spec mints a steward-only
 * account through the local auth admin API.
 *
 * Everything it writes is its own: the steward, a dog entered in today's
 * show-day class, a judge assignment and an enrollment. Nothing seeded is ever
 * written, so a failed run cannot leave shared state behind for later specs, and
 * a replication write still queued when a test stops can only reach a row this
 * spec is about to delete. Cleanup closes the page first, then deletes.
 *
 * The office writes go straight to PostgREST with the steward's own session, the
 * path the original finding used; RLS must leave zero rows changed. The control
 * sends the same PATCHes as secretary@ and must change one row each, so a probe
 * that could never succeed cannot pass as a denial.
 */

const SUPABASE = process.env.VITE_SUPABASE_URL ?? '';
const ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const CLUB_ID = 'dededede-0000-0000-0000-000000000001'; // Heartland, which runs both shows below
const OFFICE_SHOW_ID = 'dededede-0000-0000-0000-000000000010';
// A seeded judge assignment, read only as the template for a disposable copy.
const TEMPLATE_ASSIGNMENT_ID = 'dededede-0000-0000-0000-0000000000b5';
// Ringside scoring is a judge capability; any demo scoresheet shows the refusal.
const SCORE_PATH =
  '/at-show/dededede-0000-0000-0000-000000000010/class/dec1a55e-0000-0000-0000-000000000031/score/dededede-0000-0000-0000-000000000051';

test.describe.configure({ mode: 'serial' });
test.skip(!isIsolatedTarget(), 'writes real rows: isolated Supabase target only');

interface Steward {
  authUserId: string;
  email: string;
  password: string;
}

interface OfficeRows {
  assignmentId: string;
  enrollmentId: string;
  handlerId: string;
}

function suffix() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

async function createStewardOnlyAccount(): Promise<Steward> {
  const client = getIsolatedAdminClient();
  const tag = suffix();
  const email = `e2e-steward-${tag}@myk9t.test`;
  const password = `Steward-${tag}-Aa1!`;
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

/** Role, person, then auth user; returns problems instead of throwing. */
async function deleteAccount(steward: Steward): Promise<string[]> {
  const client = getIsolatedAdminClient();
  const problems: string[] = [];
  const roles = await client.from('user_roles').delete().eq('auth_user_id', steward.authUserId);
  if (roles.error) problems.push(`user_roles: ${roles.error.message}`);
  const person = await client.from('people').delete().eq('auth_user_id', steward.authUserId);
  if (person.error) problems.push(`people: ${person.error.message}`);
  const { error } = await client.auth.admin.deleteUser(steward.authUserId);
  if (error) problems.push(`auth user: ${error.message}`);
  return problems;
}

/**
 * Today's show-day fixture class (Container Novice A, two entries), re-minted on every
 * reseed, and a disposable dog entered in it. A short list keeps the dog's check-in
 * control rendered, which a long, virtualized class list would not.
 */
async function seedRingEntry(): Promise<DisposableEntry & { showId: string; classId: string }> {
  const client = getIsolatedAdminClient();
  const { data: show, error: showError } = await client
    .from('shows')
    .select('id')
    .eq('name', 'Heartland Scent Work Week')
    .order('start_date', { ascending: false })
    .limit(1)
    .single();
  if (showError || !show) throw new Error(`No show-day fixture: ${showError?.message}`);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  const { data: cls, error: classError } = await client
    .from('classes')
    .select('id, trials!inner(show_id, date), entries(id)')
    .eq('trials.show_id', show.id)
    .eq('trials.date', today)
    .eq('name', 'Container Novice A')
    .limit(1)
    .single();
  const templateEntryId = (cls?.entries as Array<{ id: string }> | undefined)?.[0]?.id;
  if (classError || !cls || !templateEntryId) {
    throw new Error(`No show-day class with an entry today: ${classError?.message}`);
  }
  const entry = await seedDisposableEntry({
    showId: show.id,
    classId: cls.id,
    templateEntryId,
    label: 'Steward Ring',
  });
  return { ...entry, showId: show.id, classId: cls.id };
}

/**
 * A disposable judge assignment (no class, so no one-judge-per-class clash) and a
 * disposable enrollment. A show allows one enrollment per handler, so the enrollment
 * gets its own disposable person as handler; not the steward, who might legitimately
 * edit their own. Whatever was made before a failure is deleted before rethrowing.
 */
async function seedOfficeRows(): Promise<OfficeRows> {
  const client = getIsolatedAdminClient();
  const { data: assignment, error: assignmentError } = await client
    .from('judge_assignments')
    .select('person_id, show_id, trial_id')
    .eq('id', TEMPLATE_ASSIGNMENT_ID)
    .single();
  if (assignmentError || !assignment) {
    throw new Error(`Could not read the assignment template: ${assignmentError?.message}`);
  }
  const rows: Partial<OfficeRows> = {};
  try {
    const { data: handler, error: handlerError } = await client
      .from('people')
      .insert({ first_name: 'Disposable', last_name: `Handler ${suffix()}` })
      .select('id')
      .single();
    if (handlerError || !handler) throw new Error(`handler: ${handlerError?.message}`);
    rows.handlerId = handler.id;

    const { data: newAssignment, error: insertAssignmentError } = await client
      .from('judge_assignments')
      .insert({ ...assignment, class_id: null, status: 'invited' })
      .select('id')
      .single();
    if (insertAssignmentError || !newAssignment) {
      throw new Error(`judge assignment: ${insertAssignmentError?.message}`);
    }
    rows.assignmentId = newAssignment.id;

    const { data: newEnrollment, error: insertEnrollmentError } = await client
      .from('enrollments')
      .insert({
        show_id: OFFICE_SHOW_ID,
        handler_id: handler.id,
        notes: 'MYK9-1498 disposable enrollment',
      })
      .select('id')
      .single();
    if (insertEnrollmentError || !newEnrollment) {
      throw new Error(`enrollment: ${insertEnrollmentError?.message}`);
    }
    rows.enrollmentId = newEnrollment.id;
    return rows as OfficeRows;
  } catch (error) {
    await deleteOfficeRows(rows);
    throw new Error(`Could not seed office rows: ${String(error)}`);
  }
}

/** Enrollment, assignment, then handler; skips what was never made, reports instead of throwing. */
async function deleteOfficeRows(rows: Partial<OfficeRows>): Promise<string[]> {
  const client = getIsolatedAdminClient();
  const problems: string[] = [];
  if (rows.enrollmentId) {
    const { error } = await client.from('enrollments').delete().eq('id', rows.enrollmentId);
    if (error) problems.push(`enrollment: ${error.message}`);
  }
  if (rows.assignmentId) {
    const { error } = await client.from('judge_assignments').delete().eq('id', rows.assignmentId);
    if (error) problems.push(`judge assignment: ${error.message}`);
  }
  if (rows.handlerId) {
    const { error } = await client.from('people').delete().eq('id', rows.handlerId);
    if (error) problems.push(`handler: ${error.message}`);
  }
  return problems;
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

/** A denial is zero rows changed or an auth refusal; anything unparsed is not a denial. */
function refused(result: { status: number; rows: number }) {
  return result.rows === 0 || result.status === 401 || result.status === 403;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Sets the dog's check-in from its own control on the ringside class list. */
async function setCheckIn(page: Page, dog: string, from: string, option: RegExp, to: string) {
  const control = (state: string) =>
    page.getByRole('button', {
      name: new RegExp(`^Check-in: ${state}\\. Change check-in for ${escapeRegExp(dog)}$`),
    });
  await control(from).click();
  await page.getByRole('dialog').getByRole('button', { name: option }).click();
  await expect(control(to)).toBeVisible({ timeout: 15_000 });
}

test('a steward-only account checks dogs in but cannot write office records', async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  const ringWrites: number[] = [];
  page.on('response', r => {
    if (r.url().includes('/rest/v1/rpc/ringside_update_entry')) ringWrites.push(r.status());
  });
  // Set up inside the guarded block, so a failure partway through setup is cleaned up too.
  let ring: Awaited<ReturnType<typeof seedRingEntry>> | undefined;
  let office: OfficeRows | undefined;
  let steward: Steward | undefined;
  let failure: unknown;
  try {
    ring = await seedRingEntry();
    office = await seedOfficeRows();
    steward = await createStewardOnlyAccount();
    const classPath = `/at-show/${ring.showId}/class/${ring.classId}`;
    await signIn(page, steward.email, steward.password, classPath);

    // Scoring is a judge capability: the steward is sent to a judge passcode.
    await page.goto(SCORE_PATH);
    await expect(page.getByText('No Scoring Access')).toBeVisible({ timeout: 30_000 });

    // Ring flow, online.
    await page.goto(classPath);
    await setCheckIn(page, ring.callName, 'Not checked in', /^Checked[ -]in$/i, 'Checked in');
    await expect.poll(() => ringWrites.length, { timeout: 30_000 }).toBeGreaterThan(0);
    await expect
      .poll(() => readReplicationStoreCount(page, 'pending_mutations'), { timeout: 30_000 })
      .toBe(0);

    // Office writes with the steward's own session: RLS leaves zero rows changed.
    const assignment = await patchAsSignedIn(
      page,
      `judge_assignments?id=eq.${office.assignmentId}`,
      { status: 'declined' }
    );
    const enrollment = await patchAsSignedIn(page, `enrollments?id=eq.${office.enrollmentId}`, {
      notes: 'changed by a steward',
    });
    expect(refused(assignment), JSON.stringify(assignment)).toBe(true);
    expect(refused(enrollment), JSON.stringify(enrollment)).toBe(true);

    // No office controls on the show home.
    await page.goto(`/shows/${OFFICE_SHOW_ID}?select=classes`);
    await page.waitForTimeout(6_000);
    await expect(
      page.getByRole('button', { name: /^Assign judge|^Trial actions|^Add classes/ })
    ).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: /^Select every class/ })).toHaveCount(0);

    // Ring flow, offline: the reset to "No Status" queues, then drains on reconnect.
    await page.goto(classPath);
    await expect(page.getByRole('button', { name: /^Pending/ })).toBeVisible({ timeout: 30_000 });
    const before = ringWrites.length;
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await setCheckIn(page, ring.callName, 'Checked in', /^No Status$/, 'Not checked in');
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
  } catch (error) {
    failure = error;
  }

  // Close the page first so no queued write is still in flight, then delete what this test made.
  await page.close();
  const problems: string[] = [];
  if (office) problems.push(...(await deleteOfficeRows(office)));
  if (steward) problems.push(...(await deleteAccount(steward)));
  if (ring) {
    try {
      await cleanupDisposableEntry(ring);
    } catch (error) {
      problems.push(String(error));
    }
  }
  // A cleanup problem fails a passing test, but never hides the failure that stopped one.
  if (failure) {
    if (problems.length) console.warn(`Cleanup after a failed run: ${problems.join('; ')}`);
    throw failure;
  }
  if (problems.length) throw new Error(`Cleanup failed: ${problems.join('; ')}`);
});

test('control: the same office writes change one row each for secretary@', async ({ page }) => {
  const office = await seedOfficeRows();
  try {
    await signInAsSecretary(page, `/shows/${OFFICE_SHOW_ID}`);
    const assignment = await patchAsSignedIn(
      page,
      `judge_assignments?id=eq.${office.assignmentId}`,
      { status: 'declined' }
    );
    const enrollment = await patchAsSignedIn(page, `enrollments?id=eq.${office.enrollmentId}`, {
      notes: 'changed by the secretary',
    });
    expect(assignment).toEqual({ status: 200, rows: 1 });
    expect(enrollment).toEqual({ status: 200, rows: 1 });
  } finally {
    await page.close();
    await deleteOfficeRows(office);
  }
});
