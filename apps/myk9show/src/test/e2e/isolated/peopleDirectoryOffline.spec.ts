import { expect, test, type Page } from '@playwright/test';
import { chooseAction } from '../helpers/actionsMenu';
import { OUTBOUND_PROBE, outboundProblem, probeOutbound } from '../helpers/landingCapture';
import { signInAsSecretary } from '../helpers/testUsers';
import {
  DEMO_SHOW_ID,
  FILLER_PEOPLE_COUNT,
  TARGET_OWNER_NAME,
  TARGET_PERSON,
  countPeopleAheadOfTarget,
  countSeededPeople,
  removePeopleDirectorySeed,
  seedPeopleDirectory,
  seededPersonIds,
  setTargetPhone,
  type PeopleDirectorySeed,
} from './peopleDirectoryFixture';

/**
 * MYK9-2503 / MYK9-2253 `verify:offline`: the people directory past row 1,000 survives a
 * cold offline reload.
 *
 * Runs only in the People directory offline workflow, on its own throwaway Supabase stack
 * with the job's outbound network closed (the spec proves that first). It seeds more
 * people than one PostgREST page holds, with the target on the last server page. It loads
 * the directory as the secretary while online and lets the service worker take control,
 * takes the whole browser offline, reloads Entry Forms and finds the target, then reaches
 * Add Person through the app's own Add Entry action and finds the target in the duplicate
 * check. A change made on the server meanwhile must arrive after reconnect, with the saved
 * directory holding exactly the people the server has.
 */

const ENTRY_FORMS_PATH = `/shows/${DEMO_SHOW_ID}/entries`;
const SAVED_DIRECTORY_KEY = 'myk9show-user-storage';
const OWNER_NOT_ON_DEVICE = 'Owner name not on this device';
const EXPECTED_SAVED_PEOPLE = FILLER_PEOPLE_COUNT + 1;
const CHANGED_PHONE = '555-0142';

test.describe.configure({ mode: 'serial' });

interface SavedDirectory {
  ids: string[];
  incomplete: boolean;
  targetPhone: string | null;
}

/** The directory as the app saved it on this device (IndexedDB in the built app). */
async function readSavedDirectory(page: Page): Promise<SavedDirectory | null> {
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
            const users =
              (state.users as Array<{ id: string; email?: string; phone?: string }> | undefined) ??
              [];
            const target = users.find(user => user.email === email);
            resolve({
              ids: users.map(user => user.id),
              incomplete: state.directoryIncomplete === true,
              targetPhone: target ? (target.phone ?? '') : null,
            });
          };
        };
      }),
    { key: SAVED_DIRECTORY_KEY, email: TARGET_PERSON.email }
  );
}

async function searchEntryForms(page: Page): Promise<void> {
  const search = page.getByPlaceholder(/Search exhibitor, dog, handler/i);
  await expect(search).toBeVisible({ timeout: 45_000 });
  await search.fill(TARGET_PERSON.lastName);
}

/** True once a service worker controls the page, so a reload offline is served by it. */
async function waitForServiceWorkerControl(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
      timeout: 30_000,
    })
    .toBe(true);
}

test('a person past row 1,000 is found offline on Entry Forms and in Add Person, then the device converges', async ({
  page,
  context,
}, info) => {
  test.skip(
    info.project.name !== 'isolated-people-directory-offline',
    'Runs only in the People directory offline workflow, on its own stack'
  );
  test.setTimeout(5 * 60_000);

  // The job's network is closed before anything runs; a pass on an open network would prove less.
  const outbound = await probeOutbound(OUTBOUND_PROBE.host, OUTBOUND_PROBE.port);
  expect(outboundProblem('refused', outbound)).toBeNull();

  let seed: PeopleDirectorySeed | null = null;
  try {
    seed = await seedPeopleDirectory();
    expect(await countSeededPeople()).toBe(EXPECTED_SAVED_PEOPLE);
    // The server pages by id: the target is on the last page, with more than one full page before it.
    expect(await countPeopleAheadOfTarget()).toBeGreaterThanOrEqual(1_000);

    // 1. Online: the secretary's device loads the whole directory, paged past 1,000.
    await signInAsSecretary(page, ENTRY_FORMS_PATH);
    await expect
      .poll(async () => (await readSavedDirectory(page))?.ids.length ?? 0, {
        timeout: 90_000,
        intervals: [1_000],
      })
      .toBeGreaterThanOrEqual(EXPECTED_SAVED_PEOPLE);
    const online = await readSavedDirectory(page);
    expect(online?.incomplete).toBe(false);
    expect(online?.targetPhone).toBe('');
    await searchEntryForms(page);
    await expect(page.getByText(`Owner: ${TARGET_OWNER_NAME}`)).toHaveCount(1, { timeout: 30_000 });

    // 2. The whole browser goes offline, not only the backend, so the shell must come from the
    // service worker. A request to the stack must now fail.
    await waitForServiceWorkerControl(page);
    await context.setOffline(true);
    const unreachable = await page.evaluate(
      url =>
        fetch(url)
          .then(() => false)
          .catch(() => true),
      process.env.VITE_SUPABASE_URL ?? ''
    );
    expect(unreachable).toBe(true);
    // A change on the server the offline device cannot see yet.
    await setTargetPhone(CHANGED_PHONE);

    // 3. Cold reload of Entry Forms: the owner who sorts last is still named.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await searchEntryForms(page);
    await expect(page.getByText(`Owner: ${TARGET_OWNER_NAME}`)).toHaveCount(1, { timeout: 45_000 });
    await expect(page.getByText(OWNER_NOT_ON_DEVICE)).toHaveCount(0);
    const offline = await readSavedDirectory(page);
    expect(offline?.ids.length).toBeGreaterThanOrEqual(EXPECTED_SAVED_PEOPLE);
    expect(offline?.targetPhone).toBe('');

    // 4. Add Person, reached the way a secretary reaches it: Add Entry, then Create New.
    await chooseAction(page, 'Add Entry');
    await expect(
      page.getByRole('heading', { name: 'Add entry', level: 1, exact: true })
    ).toBeVisible({ timeout: 45_000 });
    await page.getByRole('button', { name: /Create New/i }).click();
    await page.getByRole('menuitem', { name: /Exhibitor & Dog/i }).click();
    await expect(page.getByRole('dialog', { name: 'Add Person' })).toBeVisible();
    await page.getByLabel(/First Name/i).fill(TARGET_PERSON.firstName);
    await page.getByLabel(/Last Name/i).fill(TARGET_PERSON.lastName);
    await page.getByLabel(/Email Address/i).fill(TARGET_PERSON.email);
    await page.getByRole('button', { name: /Next: Contact/ }).click();
    const notice = page.getByTestId('person-duplicate-notice');
    await expect(notice).toBeVisible({ timeout: 30_000 });
    await expect(notice).toContainText(TARGET_PERSON.lastName);

    // 5. Reconnect: the server's change arrives, and the saved directory is exactly the
    // people the server has, each once.
    await context.setOffline(false);
    await page.goto(ENTRY_FORMS_PATH, { waitUntil: 'domcontentloaded' });
    await expect
      .poll(async () => (await readSavedDirectory(page))?.targetPhone, {
        timeout: 90_000,
        intervals: [1_000],
      })
      .toBe(CHANGED_PHONE);
    const converged = await readSavedDirectory(page);
    expect(converged?.incomplete).toBe(false);
    expect(new Set(converged?.ids).size).toBe(converged?.ids.length);
    expect(converged?.ids).toEqual(expect.arrayContaining(seededPersonIds()));
    await searchEntryForms(page);
    await expect(page.getByText(`Owner: ${TARGET_OWNER_NAME}`)).toHaveCount(1, { timeout: 30_000 });
  } finally {
    if (seed) await removePeopleDirectorySeed(seed);
  }
});
