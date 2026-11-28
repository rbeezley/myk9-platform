import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { OUTBOUND_PROBE, outboundProblem, probeOutbound } from '../helpers/landingCapture';
import { supabaseRouteGlob } from '../helpers/offlineBackend';
import { signInAsSecretary } from '../helpers/testUsers';
import {
  DEMO_SHOW_ID,
  FILLER_PEOPLE_COUNT,
  TARGET_OWNER_NAME,
  TARGET_PERSON,
  countSeededPeople,
  removePeopleDirectorySeed,
  seedPeopleDirectory,
  type PeopleDirectorySeed,
} from './peopleDirectoryFixture';

/**
 * MYK9-2503 / MYK9-2253 `verify:offline`: the people directory past row 1,000 survives a
 * cold offline reload.
 *
 * Runs only in the People directory offline workflow, on its own throwaway Supabase stack
 * with the job's outbound network closed (the spec proves that first). It seeds more
 * people than one PostgREST page holds, loads the directory as the secretary while online,
 * cuts the backend off, reloads, and finds a person who sorts past row 1,000 on Entry
 * Forms and in the Add Person duplicate check. It then reconnects and checks the device
 * converges on one complete copy.
 */

const ENTRY_FORMS_PATH = `/shows/${DEMO_SHOW_ID}/entries`;
const ADD_ENTRY_PATH = `/secretary/register/${DEMO_SHOW_ID}`;
const SAVED_DIRECTORY_KEY = 'myk9show-user-storage';
const OWNER_NOT_ON_DEVICE = 'Owner name not on this device';
const EXPECTED_SAVED_PEOPLE = FILLER_PEOPLE_COUNT + 1;

test.describe.configure({ mode: 'serial' });

interface SavedDirectory {
  total: number;
  hasTarget: boolean;
  incomplete: boolean;
}

/** The directory as the app saved it on this device (IndexedDB in the built app). */
async function readSavedDirectory(page: Page, targetEmail: string): Promise<SavedDirectory | null> {
  return page.evaluate(
    ({ key, email }) =>
      new Promise<SavedDirectory | null>(resolve => {
        const open = indexedDB.open('myK9ShowDB');
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('_zustand_state')) {
            db.close();
            resolve(null);
            return;
          }
          const read = db.transaction('_zustand_state', 'readonly').objectStore('_zustand_state');
          const request = read.get(key);
          request.onerror = () => {
            db.close();
            resolve(null);
          };
          request.onsuccess = () => {
            db.close();
            const raw = request.result?.state as string | undefined;
            if (!raw) {
              resolve(null);
              return;
            }
            const state = (JSON.parse(raw) as { state?: Record<string, unknown> }).state ?? {};
            const users = (state.users as Array<{ email?: string }> | undefined) ?? [];
            resolve({
              total: users.length,
              hasTarget: users.some(user => user.email === email),
              incomplete: state.directoryIncomplete === true,
            });
          };
        };
      }),
    { key: SAVED_DIRECTORY_KEY, email: targetEmail }
  );
}

/** Like `goOffline` (aborts every request to the stack, across reloads), but it can be switched back on. */
async function cutBackendOff(context: BrowserContext) {
  let blocking = true;
  let intercepted = 0;
  await context.route(supabaseRouteGlob(), route => {
    if (!blocking) return route.continue();
    intercepted += 1;
    return route.abort('internetdisconnected');
  });
  return {
    intercepted: () => intercepted,
    restore() {
      blocking = false;
    },
  };
}

async function searchEntryForms(page: Page): Promise<void> {
  const search = page.getByPlaceholder(/Search exhibitor, dog, handler/i);
  await expect(search).toBeVisible({ timeout: 45_000 });
  await search.fill(TARGET_PERSON.lastName);
}

test('a person past row 1,000 is found offline on Entry Forms and in Add Person, then the device converges', async ({
  page,
  context,
}) => {
  test.setTimeout(5 * 60_000);

  // The job's network is closed before anything runs; a pass on an open network would prove less.
  const outbound = await probeOutbound(OUTBOUND_PROBE.host, OUTBOUND_PROBE.port);
  expect(outboundProblem('refused', outbound)).toBeNull();

  let seed: PeopleDirectorySeed | null = null;
  try {
    seed = await seedPeopleDirectory();
    expect(await countSeededPeople()).toBe(FILLER_PEOPLE_COUNT);

    // 1. Online: the secretary's device loads the whole directory, paged past 1,000.
    await signInAsSecretary(page, ENTRY_FORMS_PATH);
    await expect
      .poll(async () => (await readSavedDirectory(page, TARGET_PERSON.email))?.total ?? 0, {
        timeout: 90_000,
        intervals: [1_000],
      })
      .toBeGreaterThanOrEqual(EXPECTED_SAVED_PEOPLE);
    const online = await readSavedDirectory(page, TARGET_PERSON.email);
    expect(online?.hasTarget).toBe(true);
    expect(online?.incomplete).toBe(false);

    await searchEntryForms(page);
    await expect(page.getByText(`Owner: ${TARGET_OWNER_NAME}`)).toHaveCount(1, { timeout: 30_000 });

    // 2. Offline, cold reload of Entry Forms: the owner who sorts last is still named.
    const backend = await cutBackendOff(context);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await searchEntryForms(page);
    await expect(page.getByText(`Owner: ${TARGET_OWNER_NAME}`)).toHaveCount(1, { timeout: 45_000 });
    await expect(page.getByText(OWNER_NOT_ON_DEVICE)).toHaveCount(0);
    const offline = await readSavedDirectory(page, TARGET_PERSON.email);
    expect(offline?.total).toBeGreaterThanOrEqual(EXPECTED_SAVED_PEOPLE);
    expect(offline?.hasTarget).toBe(true);

    // 3. Offline Add Person: the saved directory holds the same person, so the check holds.
    await page.goto(ADD_ENTRY_PATH, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', { name: 'Add entry', level: 1, exact: true })
    ).toBeVisible({ timeout: 45_000 });
    await page.getByRole('button', { name: /Create New/i }).click();
    await page.getByRole('menuitem', { name: /Exhibitor & Dog/i }).click();
    const personDialog = page.getByRole('dialog', { name: 'Add Person' });
    await expect(personDialog).toBeVisible();
    await page.getByLabel(/First Name/i).fill(TARGET_PERSON.firstName);
    await page.getByLabel(/Last Name/i).fill(TARGET_PERSON.lastName);
    await page.getByLabel(/Email Address/i).fill(TARGET_PERSON.email);
    await page.getByRole('button', { name: /Next: Contact/ }).click();
    const notice = page.getByTestId('person-duplicate-notice');
    await expect(notice).toBeVisible({ timeout: 30_000 });
    await expect(notice).toContainText(TARGET_PERSON.lastName);

    // The backend really was unreachable. A glob that matched nothing would leave every
    // assertion above running online.
    expect(backend.intercepted()).toBeGreaterThan(0);

    // 4. Reconnect: the device converges on one complete copy, the person shown once.
    backend.restore();
    await page.goto(ENTRY_FORMS_PATH, { waitUntil: 'domcontentloaded' });
    await expect
      .poll(
        async () => {
          const saved = await readSavedDirectory(page, TARGET_PERSON.email);
          return saved ? { total: saved.total, incomplete: saved.incomplete } : null;
        },
        { timeout: 90_000, intervals: [1_000] }
      )
      .toEqual({ total: expect.any(Number), incomplete: false });
    const converged = await readSavedDirectory(page, TARGET_PERSON.email);
    expect(converged?.total).toBeGreaterThanOrEqual(EXPECTED_SAVED_PEOPLE);
    expect(converged?.hasTarget).toBe(true);
    await searchEntryForms(page);
    await expect(page.getByText(`Owner: ${TARGET_OWNER_NAME}`)).toHaveCount(1, { timeout: 30_000 });
  } finally {
    if (seed) await removePeopleDirectorySeed(seed);
  }
});
