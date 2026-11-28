import { getIsolatedAdminClient } from '../helpers/isolatedFixtures';

/**
 * Seed for the people-directory offline proof (MYK9-2503, MYK9-2253).
 *
 * The isolated stack is the only place this runs: `getIsolatedAdminClient` refuses any
 * Supabase URL that is not loopback. It adds more people than one PostgREST page holds
 * (the stack's `max_rows` is 1,000), plus one person who sorts LAST by name and owns an
 * entry in the demo show, so a directory cut off at row 1,000 is missing exactly them.
 */

export const DEMO_SHOW_ID = 'dededede-0000-0000-0000-000000000010';

/** More than the 1,000 rows one request returns, so one page can never hold the directory. */
export const FILLER_PEOPLE_COUNT = 1_250;
const FILLER_EMAIL_DOMAIN = 'pd-offline.example.test';

/** Sorts after every filler (and every demo person) by last name, so it is past row 1,000. */
export const TARGET_PERSON = {
  firstName: 'Pagetest',
  lastName: 'Zzyzx',
  email: `pagetest.zzyzx@${FILLER_EMAIL_DOMAIN}`,
  streetAddress: '1 Directory Lane',
  city: 'Demoville',
  state: 'KS',
  zipCode: '99999',
} as const;
/**
 * The directory is paged by `id` ascending (`readAllPeoplePaged`), so the target's id is the
 * greatest possible and every filler's is lower: the target is always on the LAST server page,
 * past row 1,000, whatever ids the demo seed's people drew.
 */
export const TARGET_PERSON_ID = 'ffffffff-ffff-4fff-bfff-ffffffffffff';
export const FILLER_ID_PREFIX = 'a0000000-0000-4000-8000-';
export const fillerId = (index: number): string =>
  `${FILLER_ID_PREFIX}${String(index).padStart(12, '0')}`;
/** Every person this seed adds, for comparing with the saved directory. */
export const seededPersonIds = (): string[] => [
  ...Array.from({ length: FILLER_PEOPLE_COUNT }, (_, i) => fillerId(i)),
  TARGET_PERSON_ID,
];

export const TARGET_OWNER_NAME = `${TARGET_PERSON.firstName} ${TARGET_PERSON.lastName}`;

export interface PeopleDirectorySeed {
  personId: string;
  dogId: string;
  entryId: string;
  /** People rows now on the stack that the seed added (filler plus the target). */
  addedPeople: number;
}

const BATCH_SIZE = 250;

function fillerRow(index: number) {
  const n = String(index).padStart(4, '0');
  return {
    id: fillerId(index),
    first_name: 'Filler',
    last_name: `Aardvark${n}`,
    email: `filler.${n}@${FILLER_EMAIL_DOMAIN}`,
  };
}

/** Add the filler people, the target person, and one entry owned by the target in the demo show. */
export async function seedPeopleDirectory(): Promise<PeopleDirectorySeed> {
  const client = getIsolatedAdminClient();

  for (let start = 0; start < FILLER_PEOPLE_COUNT; start += BATCH_SIZE) {
    const rows = Array.from({ length: Math.min(BATCH_SIZE, FILLER_PEOPLE_COUNT - start) }, (_, i) =>
      fillerRow(start + i)
    );
    const { error } = await client.from('people').insert(rows);
    if (error) throw new Error(`Could not seed filler people: ${error.message}`);
  }

  const { data: person, error: personError } = await client
    .from('people')
    .insert({
      id: TARGET_PERSON_ID,
      first_name: TARGET_PERSON.firstName,
      last_name: TARGET_PERSON.lastName,
      email: TARGET_PERSON.email,
      street_address: TARGET_PERSON.streetAddress,
      city: TARGET_PERSON.city,
      state: TARGET_PERSON.state,
      zip_code: TARGET_PERSON.zipCode,
    })
    .select('id')
    .single();
  if (personError || !person) {
    throw new Error(`Could not seed the target person: ${personError?.message ?? 'no row'}`);
  }

  // An entry in the demo show, copied from one already there so every entry rule holds by
  // construction; only the dog's owner is the target.
  const { data: template, error: templateError } = await client
    .from('entries')
    .select('trial_id, class_id, handler_id, handler, entry_fee, payment_status, dog_id')
    .eq('show_id', DEMO_SHOW_ID)
    .limit(1)
    .single();
  if (templateError || !template) {
    throw new Error(`Could not read an entry template: ${templateError?.message ?? 'no entry'}`);
  }
  const { data: templateDog, error: templateDogError } = await client
    .from('dogs')
    .select('breed, sex')
    .eq('id', template.dog_id)
    .single();
  if (templateDogError || !templateDog) {
    throw new Error(`Could not read the template dog: ${templateDogError?.message ?? 'no dog'}`);
  }
  const { data: registrations, error: registrationsError } = await client
    .from('dog_registrations')
    .select('organization, is_primary')
    .eq('dog_id', template.dog_id);
  if (registrationsError || !registrations?.length) {
    throw new Error(
      `Could not read the template registrations: ${registrationsError?.message ?? 'none'}`
    );
  }

  const callName = `PD Offline ${Date.now()}`;
  const { data: dog, error: dogError } = await client
    .from('dogs')
    .insert({
      name: callName,
      call_name: callName,
      breed: templateDog.breed,
      sex: templateDog.sex,
      owner_id: person.id,
    })
    .select('id')
    .single();
  if (dogError || !dog) throw new Error(`Could not seed the dog: ${dogError?.message ?? 'no row'}`);

  const { error: registrationError } = await client.from('dog_registrations').insert(
    registrations.map(registration => ({
      dog_id: dog.id,
      organization: registration.organization,
      registration_number: `PD-${Date.now()}`,
      is_primary: registration.is_primary,
    }))
  );
  if (registrationError) {
    throw new Error(`Could not seed the registration: ${registrationError.message}`);
  }

  const { data: entry, error: entryError } = await client
    .from('entries')
    .insert({
      show_id: DEMO_SHOW_ID,
      trial_id: template.trial_id,
      class_id: template.class_id,
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
    throw new Error(`Could not seed the entry: ${entryError?.message ?? 'no row'}`);
  }

  return {
    personId: person.id,
    dogId: dog.id,
    entryId: entry.id,
    addedPeople: FILLER_PEOPLE_COUNT + 1,
  };
}

/** Remove what the seed added, children first. The stack is thrown away, but a local rerun is not. */
export async function removePeopleDirectorySeed(seed: PeopleDirectorySeed): Promise<void> {
  const client = getIsolatedAdminClient();
  await client.from('entries').delete().eq('id', seed.entryId);
  await client.from('dogs').delete().eq('id', seed.dogId);
  await client.from('people').delete().like('email', `%@${FILLER_EMAIL_DOMAIN}`);
}

/** Seeded people (filler plus the target) on the stack, counted with the service key. */
export async function countSeededPeople(): Promise<number> {
  const client = getIsolatedAdminClient();
  const { count, error } = await client
    .from('people')
    .select('id', { count: 'exact', head: true })
    .like('email', `%@${FILLER_EMAIL_DOMAIN}`);
  if (error) throw new Error(`Could not count the seeded people: ${error.message}`);
  return count ?? 0;
}

/** Live people the server's paging order puts ahead of the target (they sit on earlier pages). */
export async function countPeopleAheadOfTarget(): Promise<number> {
  const client = getIsolatedAdminClient();
  const { count, error } = await client
    .from('people')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .lt('id', TARGET_PERSON_ID);
  if (error) throw new Error(`Could not rank the target person: ${error.message}`);
  return count ?? 0;
}

/** A change made on the server while the browser is offline, to be seen after reconnect. */
export async function setTargetPhone(phone: string): Promise<void> {
  const client = getIsolatedAdminClient();
  const { error } = await client.from('people').update({ phone }).eq('id', TARGET_PERSON_ID);
  if (error) throw new Error(`Could not change the target person's phone: ${error.message}`);
}
