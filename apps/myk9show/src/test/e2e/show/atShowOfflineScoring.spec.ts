import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { signInAsSecretary } from '../uat/shared/auth';
import {
  installSharedStagingWriteGuard,
  type GuardedRingsideRpcCall,
} from '../helpers/sharedStagingWriteGuard';

/**
 * Suite category: feature-audit.
 *
 * Offline round-trip guard for the at-show live scoresheet, run as the SECRETARY
 * (a show manager — the role the at-show data layer fully supports for read +
 * write). Creates a disposable entry in the Heartland Scent Work Classic demo
 * class. Shared staging writes remain intercepted, while isolated runs observe
 * the real ringside_update_entry RPC and verify persisted state before deleting
 * the disposable entry.
 *
 * (Previous Heritage fixture 3b91e282… was wiped from staging — "Ringside isn't
 * enabled" — so this moved to the stable Heartland demo show.)
 */

const SHOW_ID = 'dededede-0000-0000-0000-000000000010';
const CLASS_ID = 'dec1a55e-0000-0000-0000-000000000032';
const TEMPLATE_ENTRY_ID = 'dededede-0000-0000-0000-000000000053';
const CLASS_PATH = `/at-show/${SHOW_ID}/class/${CLASS_ID}`;
// Mirrors @myk9/replication constants: DB_NAME in packages/replication/src/constants.ts
// and REPLICATION_STORES in packages/replication/src/core/DatabaseManager.ts.
const REPLICATION_DB_NAME = 'myK9_Replication';
const REPLICATED_TABLES_STORE = 'replicated_tables';
const PENDING_MUTATIONS_STORE = 'pending_mutations';

test.describe('At-show offline scoring', () => {
  test('scores offline, queues the entry update, and flushes it after reconnect', async ({
    page,
    context,
  }) => {
    const seed = await seedOfflineScoringEntry();
    const scorePath = `/at-show/${SHOW_ID}/class/${CLASS_ID}/score/${seed.entryId}`;
    const rpcCalls: GuardedRingsideRpcCall[] = [];

    try {
      await installSharedStagingWriteGuard(page, {
        observeIsolatedRingsideWrites: true,
        ringsideRpcCalls: rpcCalls,
      });
      await signInAsSecretary(page, scorePath);
      await expect(page).toHaveURL(new RegExp(escapeRegExp(scorePath)));
      await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 20_000 });

      await expect.poll(() => readEntryReplica(page, seed.entryId)).not.toBeNull();

      await context.setOffline(true);
      await page.evaluate(() => window.dispatchEvent(new Event('offline')));

      await page.getByTestId('result-Q').click();
      const saveButton = page.getByRole('button', { name: /^Save$/ });
      await expect(saveButton).toBeEnabled();
      // Offline transitions keep the scoresheet in a short layout animation.
      // Assert actionability, then avoid waiting for an impossible network
      // navigation while dispatching the already-visible click.
      await saveButton.evaluate(button => (button as HTMLButtonElement).click());

      const confirmButton = page.getByRole('button', { name: /Confirm & Submit/i });
      await expect(confirmButton).toBeEnabled();
      await confirmButton.evaluate(button => (button as HTMLButtonElement).click());

      await expect(page).toHaveURL(new RegExp(escapeRegExp(CLASS_PATH)), { timeout: 15_000 });
      await expect
        .poll(() => readPendingMutationCount(page), { timeout: 10_000 })
        .toBeGreaterThan(0);
      await expect
        .poll(() => readEntryReplica(page, seed.entryId), { timeout: 10_000 })
        .toMatchObject({
          syncStatus: 'pending',
          isDirty: true,
          data: expect.objectContaining({
            result_status: 'qualified',
            is_scored: true,
          }),
        });

      await context.setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event('online')));

      await expect
        .poll(
          () =>
            rpcCalls.some(
              call =>
                call.p_entry_id === seed.entryId && call.p_fields?.result_status === 'qualified'
            ),
          { timeout: 20_000 }
        )
        .toBe(true);
      await expect.poll(() => readPendingMutationCount(page), { timeout: 20_000 }).toBe(0);
      await expect
        .poll(() => readPersistedScoringState(seed.entryId), { timeout: 20_000 })
        .toEqual({ is_scored: true, result_status: 'qualified' });
    } finally {
      try {
        await context.setOffline(false);
      } finally {
        await cleanupOfflineScoringEntry(seed);
      }
    }
  });
});

interface OfflineScoringSeed {
  entryId: string;
  dogId: string;
}

interface PersistedScoringState {
  is_scored: boolean;
  result_status: string | null;
}

async function seedOfflineScoringEntry(): Promise<OfflineScoringSeed> {
  const client = getIsolatedAdminClient();
  const { data: template, error: templateError } = await client
    .from('entries')
    .select('trial_id, handler_id, handler, entry_fee, payment_status, dog_id')
    .eq('id', TEMPLATE_ENTRY_ID)
    .single();
  if (templateError || !template) {
    throw new Error(
      `Could not read scoring entry template: ${templateError?.message ?? 'missing entry'}`
    );
  }

  const { data: templateDog, error: templateDogError } = await client
    .from('dogs')
    .select('owner_id, breed, sex')
    .eq('id', template.dog_id)
    .single();
  if (templateDogError || !templateDog) {
    throw new Error(
      `Could not read scoring dog template: ${templateDogError?.message ?? 'missing dog'}`
    );
  }

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const { data: dog, error: dogError } = await client
    .from('dogs')
    .insert({
      name: `Offline Score ${suffix}`,
      call_name: `Offline Score ${suffix}`,
      breed: templateDog.breed,
      sex: templateDog.sex,
      owner_id: templateDog.owner_id,
    })
    .select('id')
    .single();
  if (dogError || !dog) {
    throw new Error(`Could not seed scoring dog: ${dogError?.message ?? 'missing dog'}`);
  }

  // The new dog must carry a registration for this trial's registry, or the
  // `entries_require_dog_registration` trigger (migration 20260828210000)
  // rejects the entry with "A registration number is required to enter."
  //
  // Copy the TEMPLATE dog's registrations rather than hard-coding AKC: the
  // template already enters this class, so whatever it holds satisfies the
  // trigger by construction, and this keeps working if the trial's registry
  // changes.
  const { data: templateRegistrations, error: templateRegistrationsError } = await client
    .from('dog_registrations')
    .select('organization, registration_number, is_primary')
    .eq('dog_id', template.dog_id);
  if (templateRegistrationsError || !templateRegistrations?.length) {
    await client.from('dogs').delete().eq('id', dog.id);
    throw new Error(
      `Could not read template registrations: ${
        templateRegistrationsError?.message ?? 'template dog has none'
      }`
    );
  }

  const { error: registrationError } = await client.from('dog_registrations').insert(
    templateRegistrations.map(registration => ({
      dog_id: dog.id,
      organization: registration.organization,
      // Unique per seeded dog so a re-run cannot collide with a previous one.
      registration_number: `E2E-${suffix}`,
      is_primary: registration.is_primary,
    }))
  );
  if (registrationError) {
    await client.from('dogs').delete().eq('id', dog.id);
    throw new Error(`Could not seed scoring registration: ${registrationError.message}`);
  }

  const { data: entry, error: entryError } = await client
    .from('entries')
    .insert({
      show_id: SHOW_ID,
      trial_id: template.trial_id,
      class_id: CLASS_ID,
      dog_id: dog.id,
      handler_id: template.handler_id,
      handler: template.handler,
      entry_status: 'confirmed',
      payment_status: template.payment_status,
      entry_fee: template.entry_fee,
      is_scored: false,
      result_status: 'pending',
    })
    .select('id')
    .single();
  if (entryError || !entry) {
    // dog_registrations.dog_id is ON DELETE CASCADE, so dropping the dog takes
    // the registrations seeded above with it.
    await client.from('dogs').delete().eq('id', dog.id);
    throw new Error(`Could not seed scoring entry: ${entryError?.message ?? 'missing entry'}`);
  }

  return { entryId: entry.id, dogId: dog.id };
}

async function cleanupOfflineScoringEntry(seed: OfflineScoringSeed) {
  const client = getIsolatedAdminClient();
  const entryResult = await client.from('entries').delete().eq('id', seed.entryId);
  const dogResult = await client.from('dogs').delete().eq('id', seed.dogId);
  if (entryResult.error || dogResult.error) {
    throw new Error(
      `Could not clean up scoring fixture: ${
        entryResult.error?.message ?? dogResult.error?.message ?? 'unknown error'
      }`
    );
  }
}

async function readPersistedScoringState(entryId: string): Promise<PersistedScoringState> {
  const client = getIsolatedAdminClient();
  const { data, error } = await client
    .from('entries')
    .select('is_scored, result_status')
    .eq('id', entryId)
    .single();
  if (error || !data) {
    throw new Error(`Could not read isolated scoring state: ${error?.message ?? 'missing entry'}`);
  }
  return data;
}

function getIsolatedAdminClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Missing isolated Supabase URL or service-role key');
  }

  const hostname = new URL(url).hostname;
  if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
    throw new Error('Offline scoring persistence verification requires an isolated Supabase target');
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

async function readEntryReplica(page: Page, entryId: string) {
  return page.evaluate(
    ({ dbName, storeName, entryId }) =>
      new Promise<{
        syncStatus?: string;
        isDirty?: boolean;
        data?: Record<string, unknown>;
      } | null>(resolve => {
        const openReq = indexedDB.open(dbName);
        openReq.onerror = () => resolve(null);
        openReq.onsuccess = () => {
          const db = openReq.result;
          if (!db.objectStoreNames.contains(storeName)) {
            db.close();
            resolve(null);
            return;
          }
          const getReq = db
            .transaction(storeName, 'readonly')
            .objectStore(storeName)
            .get(['entries', entryId]);
          getReq.onsuccess = () => {
            const row = getReq.result as
              | {
                  syncStatus?: string;
                  isDirty?: boolean;
                  data?: Record<string, unknown>;
                }
              | undefined;
            db.close();
            resolve(
              row ? { syncStatus: row.syncStatus, isDirty: row.isDirty, data: row.data } : null
            );
          };
          getReq.onerror = () => {
            db.close();
            resolve(null);
          };
        };
      }),
    { dbName: REPLICATION_DB_NAME, storeName: REPLICATED_TABLES_STORE, entryId }
  );
}

async function readPendingMutationCount(page: Page) {
  return page.evaluate(
    ({ dbName, storeName }) =>
      new Promise<number>(resolve => {
        const openReq = indexedDB.open(dbName);
        openReq.onerror = () => resolve(0);
        openReq.onsuccess = () => {
          const db = openReq.result;
          if (!db.objectStoreNames.contains(storeName)) {
            db.close();
            resolve(0);
            return;
          }
          const countReq = db.transaction(storeName, 'readonly').objectStore(storeName).count();
          countReq.onsuccess = () => {
            db.close();
            resolve(countReq.result);
          };
          countReq.onerror = () => {
            db.close();
            resolve(0);
          };
        };
      }),
    { dbName: REPLICATION_DB_NAME, storeName: PENDING_MUTATIONS_STORE }
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
