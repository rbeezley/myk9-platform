import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SHOW_ID = '4584f257-19b5-4016-aae6-5e7827b769cb';

export interface SecretaryUatSeed {
  runId: string;
  showId: string;
  personId: string;
  dogId: string;
  dogName: string;
  trialId: string;
  classId: string;
  className: string;
  entryId: string;
  armband: string;
}

export async function seedSecretaryEntry(testInfo: TestInfo): Promise<SecretaryUatSeed> {
  const client = getAdminClient();
  const runId = makeRunId();
  const suffix = runId.slice(-8);
  const dogName = `UAT Secretary Dog ${suffix}`;
  const className = `UAT Interior Novice A ${suffix}`;
  const armband = await findAvailableArmband(
    client,
    `89${suffix.replace(/\D/g, '').slice(0, 3).padEnd(3, '0')}`
  );

  const { data: person, error: personError } = await client
    .from('people')
    .insert({
      first_name: 'UAT',
      last_name: `Secretary ${suffix}`,
      email: `uat-secretary-${suffix}@example.test`,
    })
    .select('id')
    .single();
  if (personError || !person) throw new Error(`UAT person seed failed: ${personError?.message}`);

  const { data: dog, error: dogError } = await client
    .from('dogs')
    .insert({
      name: dogName,
      call_name: dogName,
      breed: 'UAT Test Breed',
      sex: 'female',
      owner_id: person.id,
    })
    .select('id')
    .single();
  if (dogError || !dog) throw new Error(`UAT dog seed failed: ${dogError?.message}`);

  await client.from('dog_registrations').insert({
    dog_id: dog.id,
    organization: 'AKC',
    registration_number: `UAT-${suffix}`,
    verified: true,
  });

  const { data: trial, error: trialError } = await client
    .from('trials')
    .insert({
      show_id: SHOW_ID,
      name: `UAT Secretary Trial ${suffix}`,
      date: '2026-06-13',
      trial_number: `UAT-${suffix}`,
      event_number: `UAT-${suffix}`,
    })
    .select('id')
    .single();
  if (trialError || !trial) throw new Error(`UAT trial seed failed: ${trialError?.message}`);

  const { data: cls, error: classError } = await client
    .from('classes')
    .insert({
      trial_id: trial.id,
      name: className,
      element: 'Interior',
      level: 'Novice',
      section: 'A',
      entry_fee: 10,
    })
    .select('id')
    .single();
  if (classError || !cls) throw new Error(`UAT class seed failed: ${classError?.message}`);

  const { data: entry, error: entryError } = await client
    .from('entries')
    .insert({
      show_id: SHOW_ID,
      trial_id: trial.id,
      class_id: cls.id,
      dog_id: dog.id,
      handler_id: person.id,
      handler: `UAT Secretary ${suffix}`,
      entry_status: 'submitted',
      payment_status: 'pending',
      entry_fee: 10,
      submitted_at: new Date().toISOString(),
      special_requests: `uat_run_id:${runId}`,
    })
    .select('id')
    .single();
  if (entryError || !entry) throw new Error(`UAT entry seed failed: ${entryError?.message}`);

  const seed: SecretaryUatSeed = {
    runId,
    showId: SHOW_ID,
    personId: person.id,
    dogId: dog.id,
    dogName,
    trialId: trial.id,
    classId: cls.id,
    className,
    entryId: entry.id,
    armband,
  };

  await writeManifest(testInfo, seed, 'created');
  return seed;
}

export async function cleanupSecretaryEntry(testInfo: TestInfo, seed: SecretaryUatSeed | null) {
  if (!seed) return;
  const client = getAdminClient();
  const cleanupStatus: Record<string, string> = {};

  const trialResult = await client.from('trials').delete().eq('id', seed.trialId);
  cleanupStatus.trial = trialResult.error?.message ?? 'deleted';

  await client.from('dog_registrations').delete().eq('dog_id', seed.dogId);
  const dogResult = await client.from('dogs').delete().eq('id', seed.dogId);
  cleanupStatus.dog = dogResult.error?.message ?? 'deleted';

  const personResult = await client.from('people').delete().eq('id', seed.personId);
  cleanupStatus.person = personResult.error?.message ?? 'deleted';

  await writeManifest(testInfo, { ...seed, cleanupStatus }, 'cleanup');
}

function getAdminClient(): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for UAT setup');
  }
  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

function makeRunId(): string {
  return `uat_secretary_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

async function findAvailableArmband(client: SupabaseClient, base: string): Promise<string> {
  for (let offset = 0; offset < 100; offset += 1) {
    const candidate = `${Number(base) + offset}`;
    const { data, error } = await client
      .from('entries')
      .select('id')
      .eq('show_id', SHOW_ID)
      .eq('armband', candidate)
      .limit(1);

    if (error) {
      throw new Error(`UAT armband availability check failed: ${error.message}`);
    }
    if ((data ?? []).length === 0) {
      return candidate;
    }
  }

  throw new Error(`No available UAT armband near ${base}`);
}

async function writeManifest(testInfo: TestInfo, data: unknown, phase: string) {
  const outputDir = path.resolve(process.cwd(), 'test-results', 'uat');
  await mkdir(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `manifest-${testInfo.testId}-${phase}.json`);
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  await testInfo.attach(`uat-manifest-${phase}`, {
    path: filePath,
    contentType: 'application/json',
  });
}
