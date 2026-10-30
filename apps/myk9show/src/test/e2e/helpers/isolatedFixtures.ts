import type { Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Fixtures for specs that write real rows, so they run only against an ISOLATED
 * Supabase target (127.0.0.1 / localhost), never shared staging or production.
 *
 * A spec that scores or checks in a seeded fixture entry changes it for every
 * later spec in the same Regression run (one database, `--workers=1`), so these
 * helpers mint a disposable dog + entry per test and delete it afterwards.
 */

// Mirrors @myk9/replication: DB_NAME in packages/replication/src/constants.ts and
// REPLICATION_STORES in packages/replication/src/core/DatabaseManager.ts.
export const REPLICATION_DB_NAME = 'myK9_Replication';

export function isIsolatedTarget(): boolean {
  const url = process.env.VITE_SUPABASE_URL;
  if (!url) return false;
  const { hostname } = new URL(url);
  return hostname === '127.0.0.1' || hostname === 'localhost';
}

export function getIsolatedAdminClient(): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Missing isolated Supabase URL or service-role key');
  }
  if (!isIsolatedTarget()) {
    throw new Error('This fixture writes real rows and requires an isolated Supabase target');
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

export interface DisposableEntry {
  entryId: string;
  dogId: string;
  callName: string;
}

/**
 * A fresh dog entered in `classId`, copied from `templateEntryId` (an entry already
 * in that class), so its owner, handler, fee and registration satisfy every entry
 * trigger by construction.
 */
export async function seedDisposableEntry(input: {
  showId: string;
  classId: string;
  templateEntryId: string;
  label: string;
}): Promise<DisposableEntry> {
  const client = getIsolatedAdminClient();
  const { data: template, error: templateError } = await client
    .from('entries')
    .select('trial_id, handler_id, handler, entry_fee, payment_status, dog_id')
    .eq('id', input.templateEntryId)
    .single();
  if (templateError || !template) {
    throw new Error(`Could not read entry template: ${templateError?.message ?? 'missing entry'}`);
  }

  const { data: templateDog, error: templateDogError } = await client
    .from('dogs')
    .select('owner_id, breed, sex')
    .eq('id', template.dog_id)
    .single();
  if (templateDogError || !templateDog) {
    throw new Error(`Could not read dog template: ${templateDogError?.message ?? 'missing dog'}`);
  }

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const callName = `${input.label} ${suffix}`;
  const { data: dog, error: dogError } = await client
    .from('dogs')
    .insert({
      name: callName,
      call_name: callName,
      breed: templateDog.breed,
      sex: templateDog.sex,
      owner_id: templateDog.owner_id,
    })
    .select('id')
    .single();
  if (dogError || !dog) {
    throw new Error(`Could not seed dog: ${dogError?.message ?? 'missing dog'}`);
  }

  // The new dog needs a registration for this trial's registry, or the
  // `entries_require_dog_registration` trigger rejects the entry. Copy the template
  // dog's registrations rather than hard-coding a registry.
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
    throw new Error(`Could not seed registration: ${registrationError.message}`);
  }

  const { data: entry, error: entryError } = await client
    .from('entries')
    .insert({
      show_id: input.showId,
      trial_id: template.trial_id,
      class_id: input.classId,
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
    throw new Error(`Could not seed entry: ${entryError?.message ?? 'missing entry'}`);
  }

  return { entryId: entry.id, dogId: dog.id, callName };
}

export async function cleanupDisposableEntry(seed: DisposableEntry): Promise<void> {
  const client = getIsolatedAdminClient();
  const entryResult = await client.from('entries').delete().eq('id', seed.entryId);
  const dogResult = await client.from('dogs').delete().eq('id', seed.dogId);
  if (entryResult.error || dogResult.error) {
    throw new Error(
      `Could not clean up disposable entry: ${
        entryResult.error?.message ?? dogResult.error?.message ?? 'unknown error'
      }`
    );
  }
}

/** Row count of a replication store in the page's IndexedDB; 0 when the store is absent. */
export async function readReplicationStoreCount(
  page: Page,
  storeName: 'pending_mutations' | 'failed_mutations'
): Promise<number> {
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
    { dbName: REPLICATION_DB_NAME, storeName }
  );
}
