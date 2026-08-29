import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { TEST_USERS } from '../e2e/fixtures/test-users';

// Contract for the club-scoped test identity (MYK9-137).
//
// Club authority is granted by a DISJUNCTION:
//
//   IF NOT (public.is_site_admin() OR public.is_club_admin(p_club_id)) THEN ...
//
// An actor holding site_admin therefore satisfies every club gate through the
// LEFT branch, without the club term ever being evaluated. When the clubAdmin
// fixture was the site-admin account, "a club admin may not act on club B" was
// unfalsifiable: the assertion passed whether or not club scoping existed, so
// deleting `is_club_admin(...)` from a gate would not have reddened a single test.
//
// The failure mode is a test that reports a PASS it never earned, which review
// cannot see and coverage counts in its favour. These assertions pin the identity
// itself, so re-pointing clubAdmin at the site admin fails here instead.
//
// Source-text assertions (rather than live queries) because the subject is the
// seed and fixture definitions themselves — they must be right BEFORE any
// database is built from them, and CI has no seeded database to query.

const repoRoot = resolve(__dirname, '../../../../..');

const CLUB_ADMIN_EMAIL = 'clubadmin@myk9t.com';
const SITE_ADMIN_EMAIL = 'testadmin@myk9t.com';
const HEARTLAND_CLUB_ID = 'dededede-0000-0000-0000-000000000001';
const PRAIRIE_TRAIL_CLUB_ID = 'dededede-0000-0000-0000-000000000002';

/** Roles that satisfy a club gate WITHOUT exercising its club term. */
const SITE_WIDE_ROLES = ['site_admin'];

function read(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('club-admin fixture identity', () => {
  it('is a different account from the site admin', () => {
    expect(TEST_USERS.clubAdmin.email).not.toBe(TEST_USERS.siteAdmin.email);
    expect(TEST_USERS.clubAdmin.email).toBe(CLUB_ADMIN_EMAIL);
    expect(TEST_USERS.siteAdmin.email).toBe(SITE_ADMIN_EMAIL);
  });

  it('holds no site-wide role', () => {
    for (const role of SITE_WIDE_ROLES) {
      expect(TEST_USERS.clubAdmin.roles).not.toContain(role);
    }
    // Club authority and nothing else — an added `secretary` or `chairman` would
    // not break scoping, but it would blur what a failure in a club-admin test
    // actually proves.
    expect([...TEST_USERS.clubAdmin.roles]).toEqual(['club_admin']);
  });

  it('draws its password from its own env var, not the admin account’s', () => {
    // Sharing E2E_ADMIN_PASSWORD would re-couple the two identities through the
    // back door: one rotation and the "club admin" is signing in as the site admin.
    const fixtureSource = read('apps/myk9show/src/test/e2e/fixtures/test-users.ts');
    const clubAdminBlock = fixtureSource.slice(
      fixtureSource.indexOf('clubAdmin: {'),
      fixtureSource.indexOf('siteAdmin: {')
    );

    expect(clubAdminBlock).toContain('E2E_CLUB_ADMIN_PASSWORD');
    expect(clubAdminBlock).not.toContain('E2E_ADMIN_PASSWORD');
  });

  it('keeps the Playwright helper roster pointed at the same split identity', () => {
    // helpers/testUsers.ts is a second, independent roster; it imports
    // @playwright/test, so assert on its source rather than importing it here.
    const helperSource = read('apps/myk9show/src/test/e2e/helpers/testUsers.ts');
    const clubAdminBlock = helperSource.slice(
      helperSource.indexOf('CLUB_ADMIN: {'),
      helperSource.indexOf('EXHIBITOR: {')
    );

    expect(clubAdminBlock).toContain(CLUB_ADMIN_EMAIL);
    expect(clubAdminBlock).toContain('E2E_CLUB_ADMIN_PASSWORD');
    expect(clubAdminBlock).not.toContain('E2E_ADMIN_PASSWORD');

    // The address is NOT env-overridable. Both seeds hard-code it, and they are
    // the only things that grant club_admin — an override could only ever sign in
    // as an account holding nothing.
    expect(clubAdminBlock).not.toContain('E2E_CLUB_ADMIN_EMAIL');
  });
});

describe('club-admin account provisioning', () => {
  const setupSource = read('apps/myk9show/scripts/setup-e2e-test-users.ts');

  it('declares the club-admin-only account with club_admin and nothing else', () => {
    expect(setupSource).toMatch(
      /email: 'clubadmin@myk9t\.com',[\s\S]*?passwordEnv: 'E2E_CLUB_ADMIN_PASSWORD',[\s\S]*?roles: \['club_admin'\]/
    );
  });

  it('marks it optional so a missing secret cannot abort the nightly run', () => {
    // This script runs inside scripts/qa/isolated-e2e-lifecycle.ts. A required
    // account with no configured password exits(1) before provisioning anything,
    // which would take out every canonical account, not just this one.
    const accountBlock = setupSource.slice(
      setupSource.indexOf("email: 'clubadmin@myk9t.com'"),
      setupSource.indexOf('const provisioningPlan')
    );
    expect(accountBlock).toContain('optional: true');
  });
});

describe('seed-demo club scope fixtures', () => {
  const seed = read('supabase/seed-demo.sql');

  it('seeds a second club so a cross-club rejection has a subject', () => {
    expect(seed).toContain(PRAIRIE_TRAIL_CLUB_ID);
    expect(seed).toContain('Prairie Trail Dog Sports Club');
  });

  it('re-seeds both clubs without a second-run collision', () => {
    // A seed that creates a row it cannot clean up fails its SECOND run, which is
    // the run nobody watches. That intent is unchanged; the MECHANISM had to move.
    //
    // F30 made shows.club_id ON DELETE RESTRICT, so the old
    // `DELETE FROM public.clubs` in the idempotency block can no longer run at all
    // — a club that owns a show refuses to be deleted, which is the whole point of
    // the finding. The clubs INSERT now upserts instead, which is what actually
    // delivers idempotency. Dependent rows carry their own conflict clauses
    // (club_members DO NOTHING, club_stripe_accounts DO UPDATE) and club_officers
    // is not seeded, so nothing relied on the cascade the DELETE used to trigger.
    const clubsBlock = seed.slice(
      seed.indexOf('-- 1. Clubs'),
      seed.indexOf('INSERT INTO public.club_stripe_accounts')
    );
    expect(clubsBlock).toContain('ON CONFLICT (id) DO UPDATE');
    // An upsert that leaves deleted_at set "succeeds" while the club stays invisible
    // to every read, silently emptying the demo dataset. The DELETE it replaced
    // always produced a fresh row, so recovery must be explicit.
    expect(clubsBlock).toContain('deleted_at  = NULL');
    expect(clubsBlock).toContain('deleted_by  = NULL');
    expect(clubsBlock).toContain(HEARTLAND_CLUB_ID);
    expect(clubsBlock).toContain(PRAIRIE_TRAIL_CLUB_ID);
    // The delete-and-recreate pair must not come back for the DEMO clubs: it cannot
    // survive RESTRICT. The load-fixture clubs are a different range and are still
    // deleted here — legitimately, because their shows are deleted first.
    const idempotencyBlock = seed.slice(
      seed.indexOf('-- 0. Idempotency'),
      seed.indexOf('-- 1. Clubs')
    );
    // The removed club DELETE cascaded to every child of `clubs`. An upsert only
    // touches declared rows, so the cascade is replicated explicitly or a reseed
    // stops being deterministic: extra members, stale club-scoped role grants and
    // orphaned secretary tasks would all survive and contaminate role walks.
    for (const child of [
      'club_members',
      'club_officers',
      'club_premium_templates',
      'premium_generations',
      'secretary_tasks',
      'user_roles',
      // No exemptions. Upserting the DECLARED row is a different property from
      // removing UNDECLARED ones, and exempting this table on that basis is exactly
      // the mistake this list exists to prevent.
      'club_stripe_accounts',
    ]) {
      expect(idempotencyBlock).toContain(`DELETE FROM public.${child}`);
    }

    const clubDeleteStart = idempotencyBlock.indexOf('DELETE FROM public.clubs');
    if (clubDeleteStart !== -1) {
      const clubDelete = idempotencyBlock.slice(
        clubDeleteStart,
        idempotencyBlock.indexOf(';', clubDeleteStart)
      );
      expect(clubDelete).not.toContain(HEARTLAND_CLUB_ID);
      expect(clubDelete).not.toContain(PRAIRIE_TRAIL_CLUB_ID);
    }
  });

  it('seeds club_members for both clubs', () => {
    expect(seed).toContain('INSERT INTO public.club_members');

    const membersBlock = seed.slice(
      seed.indexOf('INSERT INTO public.club_members'),
      seed.indexOf('-- 2. Published show')
    );
    expect(membersBlock).toContain(HEARTLAND_CLUB_ID);
    expect(membersBlock).toContain(PRAIRIE_TRAIL_CLUB_ID);
    // Idempotent AND reset. Not colliding is only half of it: since F30 the demo
    // clubs are upserted rather than delete-and-recreated, so the cascade that used
    // to clear these rows is gone. DO NOTHING would preserve a membership a QA run
    // had suspended, and the reseed would report success on a wrong dataset.
    expect(membersBlock).toContain('ON CONFLICT (club_id, person_id) DO UPDATE');
    expect(membersBlock).toContain('membership_status = EXCLUDED.membership_status');
    expect(membersBlock).not.toContain('ON CONFLICT (club_id, person_id) DO NOTHING');
  });

  // Bounded by the NEXT subsection, not by section 11. 10e was the last block
  // under section 10 when this was written, so "to section 11" happened to mean
  // "the 10e block" — until 10f/10g were added (MYK9-141) and the window silently
  // grew to include another account's grants, failing the exactly-one-role
  // assertion below on a seed that was correct.
  //
  // Bounded by 10g rather than 10f since 2026-08-23: 10f was deleted with the
  // empty-assignment judge fixture. Only a comment sits between 10e and 10g, and
  // it names no role, so the exactly-one-role assertion is unaffected.
  function readClubAdminGrantBlock(): string {
    const start = seed.indexOf('-- 10e.');
    expect(start).toBeGreaterThan(-1);
    const end = seed.indexOf('-- 10g.', start);
    expect(end).toBeGreaterThan(start);
    return seed.slice(start, end);
  }

  it('grants the club-admin-only account club_admin on Heartland alone', () => {
    const grantBlock = readClubAdminGrantBlock();

    expect(grantBlock).toContain(CLUB_ADMIN_EMAIL);
    expect(grantBlock).toContain(HEARTLAND_CLUB_ID);
    // The whole point: it must NOT be an admin of the club it has to be refused on.
    expect(grantBlock).not.toContain(PRAIRIE_TRAIL_CLUB_ID);
  });

  it('grants the club-admin-only account exactly one role, and it is club_admin', () => {
    // Asserted over the roles the 10e block names, not over an absence: an
    // "expect(...).not.toContain('site_admin')" would also pass on a seed that
    // stopped mentioning the account entirely.
    const grantBlock = readClubAdminGrantBlock();
    const rolesNamed = new Set(
      Array.from(grantBlock.matchAll(/r\.name = '([a-z_]+)'/g), match => match[1])
    );

    expect([...rolesNamed]).toEqual(['club_admin']);
    for (const role of SITE_WIDE_ROLES) {
      expect(rolesNamed.has(role)).toBe(false);
    }
  });

  it('provisions the optional account in isolated runs without making it required', () => {
    const isolated = read('supabase/seed-isolated-e2e-accounts.sql');

    // Present: profile normalization, the onboarding bypass, and a CLUB-SCOPED
    // grant — otherwise configuring the secret yields an account that can sign in
    // but lands on the first-run wizard with no club authority.
    expect(isolated).toContain(CLUB_ADMIN_EMAIL);
    expect(isolated).toContain('exhibitor_profiles');

    // Absent from the assertion that aborts the run: this account is optional, so
    // requiring it would break every environment that has no secret for it.
    const assertionBlock = isolated.slice(
      isolated.indexOf('account_count integer'),
      isolated.indexOf('exhibitor_profiles')
    );
    expect(assertionBlock).not.toContain(CLUB_ADMIN_EMAIL);
    expect(assertionBlock).toContain('account_count <> 4');
  });

  it('never grants the isolated club admin a platform-wide role', () => {
    // A club_id IS NULL grant would hand it authority everywhere, which is the
    // exact property that made the old fixture unable to test scoping.
    const isolated = read('supabase/seed-isolated-e2e-accounts.sql');
    const platformWideBlock = isolated.slice(
      isolated.indexOf("('exhibitor@myk9t.com', 'exhibitor')"),
      isolated.indexOf("('secretary@myk9t.com', 'secretary')")
    );

    expect(platformWideBlock).not.toContain(CLUB_ADMIN_EMAIL);
  });

  it('leaves the optional account out of the preflight guard', () => {
    // The preflight aborts the seed when a listed account is missing. This one is
    // provisioned only where E2E_CLUB_ADMIN_PASSWORD exists, so listing it would
    // make every other environment fail to seed at all.
    const preflight = seed.slice(seed.indexOf('-- Preflight:'), seed.indexOf('-- Fixed ids'));
    expect(preflight).not.toContain(CLUB_ADMIN_EMAIL);
  });
});
