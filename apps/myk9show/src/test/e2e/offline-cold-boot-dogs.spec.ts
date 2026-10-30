import { test, expect } from '@playwright/test';
import { signInAsExhibitor } from './helpers/testUsers';
import { goOffline, reportOffline } from './helpers/offlineBackend';

test.describe.configure({ timeout: 150_000 });

test.describe('offline cold boot: dogs', () => {
  // MYK9-1493. The roster and detail read the replica, but the person id they are keyed on came
  // from two network-only lookups (`people` and `exhibitor_profiles`), so a cold offline boot
  // held cached roles and no person id: the own-dogs read stayed disabled and the page stated
  // "No dogs yet / Add your first dog" over a full replica.
  test('a cold offline reload of a dog page still shows the account dogs, never "No dogs yet"', async ({
    page,
    context,
  }) => {
    const WILLOW_ID = 'dededede-0000-0000-0000-000000000041';
    await signInAsExhibitor(page, `/dogs/${WILLOW_ID}`);
    await page.waitForURL(`**/dogs/${WILLOW_ID}`, { timeout: 30_000 });
    await expect(page.getByRole('region', { name: 'Dog details' })).toBeVisible({
      timeout: 45_000,
    });

    // A verified replica: the dog row is in IndexedDB before the backend is cut. Without this the
    // offline assertions could pass or fail for a replica that was simply never filled.
    await expect
      .poll(
        () =>
          page.evaluate(
            (dogId: string) =>
              new Promise<boolean>(resolve => {
                const open = indexedDB.open('myK9_Replication');
                open.onerror = () => resolve(false);
                open.onsuccess = () => {
                  const db = open.result;
                  if (!db.objectStoreNames.contains('replicated_tables')) {
                    db.close();
                    resolve(false);
                    return;
                  }
                  const all = db
                    .transaction('replicated_tables', 'readonly')
                    .objectStore('replicated_tables')
                    .getAll();
                  all.onerror = () => {
                    db.close();
                    resolve(false);
                  };
                  all.onsuccess = () => {
                    const found = all.result.some(row => JSON.stringify(row).includes(dogId));
                    db.close();
                    resolve(found);
                  };
                };
              }),
            WILLOW_ID
          ),
        { timeout: 60_000 }
      )
      .toBe(true);

    const interceptedCount = await goOffline(context);
    await reportOffline(context);
    await page.reload({ waitUntil: 'domcontentloaded' });

    const list = page.getByRole('region', { name: 'Dog list' });
    await expect(list).toBeVisible({ timeout: 45_000 });
    await expect(list.getByRole('link', { name: /willow/i }).first()).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByText('No dogs yet')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add Dog' })).toHaveCount(0);
    // The URL's dog opened, not the "My Dogs" placeholder.
    await expect(page.getByRole('region', { name: 'Dog details' })).not.toContainText('My Dogs');

    // Career renders too. Offline, its Upcoming Shows panel either counts the replica's entries
    // or says it cannot check; it never states a confident "none".
    const details = page.getByRole('region', { name: 'Dog details' });
    await details.getByRole('tab', { name: 'Career' }).click();
    await expect(details.getByRole('tabpanel', { name: 'Upcoming Shows' })).toContainText(
      /\d+ entr(y|ies) upcoming|Can't check for upcoming shows offline/i,
      { timeout: 45_000 }
    );
    await expect(page.evaluate(() => navigator.onLine)).resolves.toBe(false);
    expect(interceptedCount()).toBeGreaterThan(0);
  });
});
