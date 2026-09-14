import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source-text contract for the MYK9-490 self-cleaning follow-up in
 * supabase/seed-demo.sql.
 *
 * The clear section used to remove rows by hard-coded id lists (or id-range
 * bounds) only. A row created OUTSIDE those lists — a stray wizard entry, a
 * stray waitlist join — was invisible to them and blocked a later DELETE with
 * a foreign-key violation. On 2026-09-12 a manual walk through the
 * registration wizard against the demo show created an entry
 * (fdf15504-d9ea-4862-b373-40db20cc4566) whose registration_id pointed at the
 * seed's multi-dog enrollment; it was not in the id list, and it blocked the
 * enrollment delete via entries_registration_id_fkey.
 *
 * The fix adds deletes keyed on the PARENT RELATIONSHIP (registration_id /
 * dog_id) rather than on id, ahead of every delete of that parent. These
 * assertions pin that those relationship-based deletes exist and run BEFORE
 * the parent row they protect — removing them, or reordering them after the
 * parent delete, must fail this test rather than only the next reseed.
 */

const repoRoot = resolve(__dirname, '../../../../..');
const ENROLLMENT_ID = 'dededede-0000-0000-0000-000000000070';

const seed = readFileSync(join(repoRoot, 'supabase/seed-demo.sql'), 'utf8');

describe('seed-demo self-cleaning relationship deletes (MYK9-490 follow-up)', () => {
  it('deletes entries by registration_id (not just by hard-coded id) before the enrollment delete', () => {
    const relationshipDelete = seed.indexOf(
      `DELETE FROM public.entries\nWHERE registration_id = '${ENROLLMENT_ID}'`
    );
    const enrollmentDelete = seed.indexOf('DELETE FROM public.enrollments');

    expect(
      relationshipDelete,
      'entries-by-registration_id delete not found — the MYK9-490 self-cleaning fix was removed'
    ).toBeGreaterThan(-1);
    expect(enrollmentDelete).toBeGreaterThan(-1);
    expect(
      relationshipDelete,
      'entries.registration_id is NO ACTION, so this delete must run before the enrollment it protects'
    ).toBeLessThan(enrollmentDelete);

    // The whole point is to catch a STRAY row whose registration_id resolves
    // to the enrollment through a subquery, not merely restate the seed's own
    // hard-coded enrollment id under a different clause.
    const statementEnd = seed.indexOf(';', relationshipDelete);
    const statement = seed.slice(relationshipDelete, statementEnd);
    expect(statement).toContain('SELECT id FROM public.enrollments');
  });

  it('deletes waitlist_entries by dog_id before every dogs delete that shares its id range', () => {
    const waitlistDeletes = [...seed.matchAll(/DELETE FROM public\.waitlist_entries\b[^;]*;/g)];
    const dogsDeletes = [...seed.matchAll(/DELETE FROM public\.dogs\b[^;]*;/g)];

    expect(
      waitlistDeletes.length,
      'no waitlist_entries delete found — the MYK9-490 self-cleaning fix was removed'
    ).toBeGreaterThanOrEqual(2);
    expect(dogsDeletes.length).toBeGreaterThanOrEqual(2);

    // Pair each dogs delete with the waitlist_entries delete that shares its
    // literal id(s) — an id list shares its ids verbatim, and a UUID-range
    // delete shares its range bounds verbatim — then assert the waitlist
    // delete runs first. waitlist_entries.dog_id is NO ACTION, so a stray
    // waitlist join in that same range would otherwise block the dogs delete.
    for (const dogsMatch of dogsDeletes) {
      const dogsIds = [...dogsMatch[0].matchAll(/'([0-9a-f-]{36})'/g)].map(m => m[1]);
      const dogsIndex = dogsMatch.index as number;
      const partner = waitlistDeletes.find(w => dogsIds.some(id => w[0].includes(`'${id}'`)));

      expect(
        partner,
        `dogs delete at offset ${dogsIndex} has no matching waitlist_entries delete guarding it`
      ).toBeDefined();
      expect(partner!.index as number).toBeLessThan(dogsIndex);
    }
  });
});
