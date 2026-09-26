import { expect, test, type Page } from '@playwright/test';
import { DB_NAME, DB_VERSION, REPLICATION_SCHEMA } from '@myk9/replication';
import { signInAsSecretary } from '../uat/shared/auth';
import { installSharedStagingWriteGuard } from '../helpers/sharedStagingWriteGuard';

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

function resultButton(page: Page, code: 'Q' | 'NQ') {
  return page.locator(`button[aria-label="${code}"]`).filter({
    hasText: code === 'Q' ? 'Qualified' : 'Not Qualified',
  });
}

async function preventSharedScoringWrites(page: Page) {
  await installSharedStagingWriteGuard(page);

  await page.route('**/rest/v1/dog_registrations**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
}

async function seedPaperScoringCache(page: Page) {
  const now = Date.now();
  // Replication rows intentionally include both app-facing camelCase and
  // Supabase-facing snake_case fields because the page reads through the
  // local replicated cache while mutations serialize back to DB column names.
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

  // MYK9-793: build the stores/indexes from the app's own schema
  // (`REPLICATION_SCHEMA`, sourced from `DatabaseManager`) instead of a
  // hand-written copy, so this seed can't silently diverge from what the app
  // actually creates when it is the first thing to open the DB.
  const indexNamesByStore = await page.evaluate(
    async ({ dbName, dbVersion, seedRows, timestamp, schema }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName, dbVersion);

        request.onupgradeneeded = () => {
          const database = request.result;
          for (const storeDef of schema) {
            if (database.objectStoreNames.contains(storeDef.name)) continue;
            const store = database.createObjectStore(storeDef.name, {
              keyPath: storeDef.keyPath,
            });
            for (const indexDef of storeDef.indexes) {
              store.createIndex(indexDef.name, indexDef.keyPath, { unique: indexDef.unique });
            }
          }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      const storeNames = Array.from(db.objectStoreNames);
      const readTx = db.transaction(storeNames, 'readonly');
      const namesByStore: Record<string, string[]> = {};
      for (const storeName of storeNames) {
        namesByStore[storeName] = Array.from(readTx.objectStore(storeName).indexNames).sort();
      }

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

      return namesByStore;
    },
    {
      dbName: DB_NAME,
      dbVersion: DB_VERSION,
      seedRows: rows,
      timestamp: now,
      schema: REPLICATION_SCHEMA,
    }
  );

  // Assert against the same schema the seed just built from: a version bump
  // that adds/renames an index here fails this spec instead of silently
  // seeding a DB that reads as empty (MYK9-793).
  const expectedIndexNamesByStore = Object.fromEntries(
    REPLICATION_SCHEMA.map(storeDef => [storeDef.name, storeDef.indexes.map(i => i.name).sort()])
  );
  expect(indexNamesByStore).toEqual(expectedIndexNamesByStore);
}

async function openScoringFlow(page: Page, mode: 'split' | 'sequential' = 'split') {
  await preventSharedScoringWrites(page);
  await signInAsSecretary(page, `/scoring/classes/${CLASS_ID}/entries?mode=${mode}`);
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
    await expect(page.getByRole('button', { name: /Willow/ })).toContainText('101');
    await expect(page.getByRole('button', { name: /Spark/ })).toContainText('102');

    await resultButton(page, 'Q').click();
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

    await resultButton(page, 'NQ').click();
    await page.locator('select#reason-select').selectOption('Incorrect Call');
    await page.getByRole('button', { name: 'Save & Next' }).click();

    await expect(page.getByText('1 of 2 scored').first()).toBeVisible({ timeout: 10000 });
    await page.getByRole('tab', { name: 'List' }).click();
    await expect(page.getByRole('button', { name: /Willow/ })).toContainText('NQ');
    await expect(page.getByRole('button', { name: /Willow/ })).toContainText('Incorrect Call');
  });
});
