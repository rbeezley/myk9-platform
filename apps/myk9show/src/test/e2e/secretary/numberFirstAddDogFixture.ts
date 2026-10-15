import type { SupabaseClient } from '@supabase/supabase-js';
import { must, ok } from './waitlistJourneyFixture';

/**
 * Service-role setup, reads and teardown for `numberFirstAddDogJourney.spec.ts` (MYK9-1162).
 *
 * Every write goes to the isolated Playwright Regression database only: the spec builds its admin
 * client with `waitlistAdmin()`, which refuses any Supabase host that is not on this machine.
 */

/** `seed-demo.sql` section 2: Heartland Scent Work Classic (AKC), entries open CURRENT_DATE - 16 .. + 76. */
export const SHOW_ID = 'dededede-0000-0000-0000-000000000010';
/** `seed-demo.sql` section 3: Trial 2 of the show above. */
export const TRIAL_ID = 'dededede-0000-0000-0000-000000000022';
/**
 * `seed-demo.sql` section 4: Interior Novice B, on Trial 2. Chosen because no other e2e spec reads
 * it and the seed already puts two expected entries on it (Scout, Maple), which gives the
 * run-sheet absence check a positive control on the same page.
 */
export const CLASS_ID = 'dec1a55e-0000-0000-0000-000000000035';
/** `seed-demo.sql` section 6: Maple's seeded entry in the class above (status submitted). */
export const SEEDED_RUN_SHEET_DOG = 'Maple';
/**
 * `seed-demo.sql` section 5: Cooper, owned by secretary@myk9t.com. Its AKC registration number is
 * minted by the seed (`'SR' || upper(substr(md5(dog_id || 'AKC'), 1, 8))`), so the spec reads it
 * from the database rather than deriving it.
 */
export const COOPER_ID = 'dededede-0000-0000-0000-000000000046';
export const AKC_ORGANIZATION = 'AKC (American Kennel Club)';

export async function akcNumberOf(admin: SupabaseClient, dogId: string): Promise<string> {
  const rows = await must(
    'read dog registrations',
    admin.from('dog_registrations').select('organization, registration_number').eq('dog_id', dogId)
  );
  const akc = rows.find(r => (r.organization as string).startsWith('AKC'));
  if (!akc?.registration_number) throw new Error(`Seed drift: dog ${dogId} has no AKC number`);
  return akc.registration_number as string;
}

export async function personByEmail(
  admin: SupabaseClient,
  email: string
): Promise<{ id: string; fullName: string }> {
  const row = await must(
    'read person',
    admin.from('people').select('id, first_name, last_name').ilike('email', email).single()
  );
  return { id: row.id as string, fullName: `${row.first_name} ${row.last_name}`.trim() };
}

/**
 * A dog the exhibitor account can neither own nor handle, with an AKC number of its own. No
 * seeded dog is invisible to that exhibitor: they own five, and handle the sixth (Cooper, entry
 * ...069), which `dogs_select`'s handler arm shows them. The id comes from the database.
 */
export async function createForeignDog(
  admin: SupabaseClient,
  ownerPersonId: string,
  callName: string,
  registrationNumber: string
): Promise<string> {
  const dog = await must(
    'create foreign dog',
    admin
      .from('dogs')
      .insert({
        name: callName,
        call_name: callName,
        breed: 'Beagle',
        sex: 'male',
        date_of_birth: '2021-04-02',
        status: 'active',
        owner_id: ownerPersonId,
      })
      .select('id')
      .single()
  );
  await ok(
    'register foreign dog',
    admin.from('dog_registrations').insert({
      dog_id: dog.id,
      organization: AKC_ORGANIZATION,
      registration_number: registrationNumber,
      registered_name: `${callName} of Elsewhere`,
      breed: 'Beagle',
      status: 'Active',
      is_primary: true,
    })
  );
  return dog.id as string;
}

/** The spec's rows go: its entries and their enrollment, armbands, registrations, then the dog. */
export async function removeDogsNamed(admin: SupabaseClient, callNames: string[]): Promise<void> {
  const dogs = await must(
    'find journey dogs',
    admin.from('dogs').select('id').in('call_name', callNames)
  );
  for (const { id } of dogs) {
    const entries = await must(
      'read journey entries',
      admin.from('entries').select('id, registration_id').eq('dog_id', id)
    );
    const ids = entries.map(e => e.id as string);
    const enrollments = entries.map(e => e.registration_id).filter((v): v is string => !!v);
    if (ids.length > 0) {
      const { error } = await admin.from('entries').delete().in('id', ids);
      // A history or message row may still reference an entry; then retire it instead.
      if (error) {
        await ok(
          'retire journey entries',
          admin.from('entries').update({ deleted_at: new Date().toISOString() }).in('id', ids)
        );
      }
    }
    if (enrollments.length > 0) {
      await admin.from('enrollments').delete().in('id', enrollments);
    }
    await ok('delete journey armbands', admin.from('armbands').delete().eq('dog_id', id));
    await ok(
      'delete journey registrations',
      admin.from('dog_registrations').delete().eq('dog_id', id)
    );
    const { error } = await admin.from('dogs').delete().eq('id', id);
    if (error) {
      await ok(
        'retire journey dog',
        admin.from('dogs').update({ deleted_at: new Date().toISOString() }).eq('id', id)
      );
    }
  }
}
