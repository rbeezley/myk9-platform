import { expect, test, type Page } from '@playwright/test';
import { TEST_USERS, type TestUser } from '../helpers/testUsers';

const CLASS_ID = 'e2e-paper-scoring-class';
const TRIAL_ID = 'e2e-paper-scoring-trial';
const SHOW_ID = 'e2e-paper-scoring-show';
const ENTRY_ONE_ID = 'e2e-paper-scoring-entry-1';
const ENTRY_TWO_ID = 'e2e-paper-scoring-entry-2';

interface SeedRow {
  tableName: string;
  id: string;
  data: Record<string, unknown>;
}

async function signIn(page: Page, user: TestUser, returnTo: string) {
  const params = new URLSearchParams({ returnTo });
  await page.goto(`/sign-in?${params.toString()}`, { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('email-input')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('email-input').fill(user.email);
  await page.getByTestId('password-input').fill(user.password);
  await page.getByTestId('sign-in-button').click();

  await page.waitForURL(url => !url.pathname.includes('/sign-in'), { timeout: 15000 });
  await page.waitForLoadState('domcontentloaded');
  await expect(page).not.toHaveURL(/\/sign-in/);
}

async function preventSharedScoringWrites(page: Page) {
  await page.route('**/rest/v1/dog_registrations**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/rest/v1/entries**', async route => {
    const request = route.request();
    if (request.method() === 'PATCH') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }

    await route.fallback();
  });
}

async function seedPaperScoringCache(page: Page) {
  const now = Date.now();
  const rows: SeedRow[] = [
    {
      tableName: 'shows',
      id: SHOW_ID,
      data: {
        id: SHOW_ID,
        name: 'E2E Paper Scoring Show',
        organization: 'AKC',
        startDate: '2026-06-12',
        endDate: '2026-06-14',
      },
    },
    {
      tableName: 'trials',
      id: TRIAL_ID,
      data: {
        id: TRIAL_ID,
        showId: SHOW_ID,
        name: 'Friday Trial 1',
        date: '2026-06-12',
        trialNumber: '1',
        trialType: 'scent_work',
      },
    },
    {
      tableName: 'classes',
      id: CLASS_ID,
      data: {
        id: CLASS_ID,
        trialId: TRIAL_ID,
        trial_id: TRIAL_ID,
        name: 'Container Novice A',
        level: 'Novice A',
        element: 'Container',
        classStatus: 'In Progress',
      },
    },
    {
      tableName: 'dogs',
      id: 'e2e-paper-scoring-dog-1',
      data: {
        id: 'e2e-paper-scoring-dog-1',
        name: 'Willow Run Fast Asleep',
        callName: 'Willow',
        breed: 'Beagle',
      },
    },
    {
      tableName: 'dogs',
      id: 'e2e-paper-scoring-dog-2',
      data: {
        id: 'e2e-paper-scoring-dog-2',
        name: 'Northwind Bright Spark',
        callName: 'Spark',
        breed: 'Border Collie',
      },
    },
    {
      tableName: 'entries',
      id: ENTRY_ONE_ID,
      data: {
        id: ENTRY_ONE_ID,
        classId: CLASS_ID,
        class_id: CLASS_ID,
        showId: SHOW_ID,
        dogId: 'e2e-paper-scoring-dog-1',
        dog_id: 'e2e-paper-scoring-dog-1',
        armband: '101',
        handler: 'Avery Handler',
        entryStatus: 'accepted',
        entry_status: 'accepted',
        checkInStatus: 'in-ring',
        check_in_status: 'in-ring',
        runOrder: 1,
      },
    },
    {
      tableName: 'entries',
      id: ENTRY_TWO_ID,
      data: {
        id: ENTRY_TWO_ID,
        classId: CLASS_ID,
        class_id: CLASS_ID,
        showId: SHOW_ID,
        dogId: 'e2e-paper-scoring-dog-2',
        dog_id: 'e2e-paper-scoring-dog-2',
        armband: '102',
        handler: 'Jordan Handler',
        entryStatus: 'accepted',
        entry_status: 'accepted',
        checkInStatus: 'no-status',
        check_in_status: 'no-status',
        runOrder: 2,
      },
    },
  ];

  await page.evaluate(
    async ({ seedRows, timestamp }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('myK9_Replication', 5);

        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains('replicated_tables')) {
            database.createObjectStore('replicated_tables', {
              keyPath: ['tableName', 'id'],
            });
          }
          if (!database.objectStoreNames.contains('sync_metadata')) {
            database.createObjectStore('sync_metadata', { keyPath: 'tableName' });
          }
          if (!database.objectStoreNames.contains('pending_mutations')) {
            database.createObjectStore('pending_mutations', { keyPath: 'id' });
          }
          if (!database.objectStoreNames.contains('prefetch_cache')) {
            database.createObjectStore('prefetch_cache', { keyPath: 'key' });
          }
          if (!database.objectStoreNames.contains('offline_queue')) {
            database.createObjectStore('offline_queue', { keyPath: 'id' });
          }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('replicated_tables', 'readwrite');
        const store = tx.objectStore('replicated_tables');

        for (const row of seedRows) {
          store.put({
            tableName: row.tableName,
            id: row.id,
            data: row.data,
            version: 1,
            lastSyncedAt: timestamp,
            lastAccessedAt: timestamp,
            accessCount: 0,
            lastModifiedAt: timestamp,
            isDirty: false,
            syncStatus: 'synced',
          });
        }

        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      });
    },
    { seedRows: rows, timestamp: now }
  );
}

async function openScoringFlow(page: Page, mode: 'split' | 'sequential' = 'split') {
  await preventSharedScoringWrites(page);
  await signIn(page, TEST_USERS.SECRETARY, `/scoring/classes/${CLASS_ID}/entries?mode=${mode}`);
  await seedPaperScoringCache(page);
  await page.goto(`/scoring/classes/${CLASS_ID}/entries?mode=${mode}`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByRole('heading', { name: 'Container Novice A' })).toBeVisible({
    timeout: 15000,
  });
}

test.describe('Paper scoring workflow', () => {
  test('secretary records a paper result from the current split-panel flow', async ({ page }) => {
    await openScoringFlow(page);

    await expect(page.getByText('0 of 2 scored')).toBeVisible();
    await expect(page.getByRole('button', { name: /Willow/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Spark/ })).toBeVisible();

    await page.locator('button[aria-label="Q"]').last().click();
    await page.getByLabel('Search Time').fill('4231');
    await page.getByRole('button', { name: 'Save & Next' }).click();

    await expect(page.getByText('1 of 2 scored').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /Willow/ })).toContainText('Q');
    await expect(page.getByRole('button', { name: /Willow/ })).toContainText('0:42.31');
    await expect(page.getByRole('button', { name: /Spark/ })).toHaveAttribute(
      'data-active',
      'true'
    );
  });

  test('secretary can switch to the card flow and record non-qualifying reason', async ({
    page,
  }) => {
    await openScoringFlow(page, 'sequential');

    await expect(page.getByRole('tab', { name: 'Card' })).toHaveAttribute('aria-selected', 'true');

    await page.locator('button[aria-label="NQ"]').last().click();
    await page.locator('select#reason-select').selectOption('Incorrect Call');
    await page.getByRole('button', { name: 'Save & Next' }).click();

    await expect(page.getByText('1 of 2 scored').first()).toBeVisible({ timeout: 10000 });
    await page.getByRole('tab', { name: 'List' }).click();
    await expect(page.getByRole('button', { name: /Willow/ })).toContainText('NQ');
    await expect(page.getByRole('button', { name: /Willow/ })).toContainText('Incorrect Call');
  });
});
