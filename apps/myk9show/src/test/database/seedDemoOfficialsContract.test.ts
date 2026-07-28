import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Source-text contract for the Lane 1.1 demo reseed (supabase/seed-demo.sql).
//
// The original F1 bug was a role grant that was silently ABSENT from the seed:
// after a reseed the secretary golden path 403'd because nothing granted the
// secretary role. The seed was later extended to guarantee secretary/club_admin,
// and then judge/steward/chairman plus class-level judge assignments.
//
// These assertions pin the COMPLETENESS of that relational data so a future edit
// can't drop a grant or assignment and still pass review — the failure mode is
// invisible in the app until someone logs in on a freshly-reseeded DB.

const repoRoot = resolve(__dirname, '../../../../..');
const HEARTLAND_CLUB_ID = 'dededede-0000-0000-0000-000000000001';
const HEARTLAND_SHOW_ID = 'dededede-0000-0000-0000-000000000010';

function readSeed(): string {
  return readFileSync(join(repoRoot, 'supabase/seed-demo.sql'), 'utf8');
}

describe('seed-demo officials + RBAC completeness contract', () => {
  const seed = readSeed();

  it('does not repopulate show-official columns removed by migration 099', () => {
    const showInsertColumns = seed.slice(
      seed.indexOf('INSERT INTO public.shows ('),
      seed.indexOf(')\nVALUES (', seed.indexOf('INSERT INTO public.shows ('))
    );

    expect(showInsertColumns).not.toMatch(/\bchairman\b/);
    expect(showInsertColumns).not.toMatch(/\bsecretary\b/);
    expect(showInsertColumns).not.toMatch(/\bchief_steward\b/);
  });

  it('sets a judge_name on every seeded class', () => {
    expect(seed).toContain('section, judge_name,');
    // 5 classes, each carrying the assigned judge's display name.
    const judgeNameMatches = seed.match(/'Test Judge'/g) ?? [];
    expect(judgeNameMatches.length).toBeGreaterThanOrEqual(5);
  });

  // Every role whose golden path the demo must support has an idempotent grant.
  // (secretary/club_admin existed before; judge/steward/chairman were the gap.)
  const grantedRoles: Array<{ role: string; emails: string[] }> = [
    { role: 'secretary', emails: ['e2e-secretary@test.myk9.com'] },
    { role: 'club_admin', emails: ['e2e-admin@test.myk9.com'] },
    { role: 'judge', emails: ['e2e-judge@test.myk9.com'] },
    { role: 'steward', emails: ['e2e-secretary@test.myk9.com'] },
    { role: 'chairman', emails: ['e2e-admin@test.myk9.com'] },
  ];

  it.each(grantedRoles)(
    'grants the $role role with a reactivate-then-insert block',
    ({ role, emails }) => {
      // A revoke-safe grant is an UPDATE (reactivate) + INSERT (fill missing) pair.
      expect(seed).toContain(
        `SET is_active = true, auth_user_id = p.auth_user_id, expires_at = NULL`
      );
      expect(seed.includes(`r.name = '${role}'`)).toBe(true);
      // The INSERT for this role must club-scope to Heartland (migration 102 +
      // stability across reseeds) — never a NULL-club_id platform-wide grant.
      const insertForRole = seed.slice(seed.indexOf(`WHERE r.name = '${role}'`));
      expect(insertForRole).toContain(HEARTLAND_CLUB_ID);
      for (const email of emails) {
        expect(seed.toLowerCase()).toContain(email.toLowerCase());
      }
    }
  );

  it('preflights every grant account + role so a missing one fails loud', () => {
    for (const role of ['secretary', 'club_admin', 'judge', 'steward', 'chairman']) {
      expect(seed).toContain(`'${role}'`);
    }
    // The new judge/steward accounts must be in the non-null auth_user_id guard.
    for (const email of [
      'e2e-admin@test.myk9.com',
      'e2e-judge@test.myk9.com',
      'e2e-secretary@test.myk9.com',
    ]) {
      expect(seed).toContain(email);
    }
  });

  it('models judges as people with judge_qualifications (number + disciplines), not just a name string', () => {
    // Judges are people rows we reason about: judge_number + what they can judge.
    expect(seed).toContain('INSERT INTO public.judge_qualifications');
    expect(seed).toContain("ARRAY['Scent Work']");
    // A judge_number per demo judge.
    expect(seed).toContain("'AKC-SW-1002'");
    // The canonical judge account gets a qualification row.
    expect(seed).toContain('e2e-judge@test.myk9.com');
    // The two fixed qualification ids.
    expect(seed).toContain('dededede-0000-0000-0000-000000000092');
  });

  it('treats classes.judge_name as a derived snapshot, documented as such', () => {
    // The comment must flag this as a snapshot so a future edit does not mistake
    // it for the source of truth (which is the assignment).
    expect(seed).toContain('DENORMALIZED SNAPSHOT');
    expect(seed).toMatch(/judge_qualifications/);
  });

  it('assigns judges at CLASS level so the dashboard actually surfaces them', () => {
    // REGRESSION (PR #823 review): the judge dashboard data path is class-centric
    // (useJudgeAssignments -> classes -> trials; class-less rows are dropped by
    // both mappers). A judge_assignments row with only show_id + trial_id yields
    // an EMPTY dashboard. So every assignment must set class_id.
    expect(seed).toContain(HEARTLAND_SHOW_ID);

    // The INSERT column list must include class_id (not just show_id/trial_id).
    const insertCols = seed.slice(
      seed.indexOf('INSERT INTO public.judge_assignments'),
      seed.indexOf('JOIN public.people p', seed.indexOf('INSERT INTO public.judge_assignments'))
    );
    expect(insertCols).toContain('class_id');

    // Every seeded class id must appear as an assignment target.
    for (const classId of [
      'dec1a55e-0000-0000-0000-000000000031',
      'dec1a55e-0000-0000-0000-000000000032',
      'dec1a55e-0000-0000-0000-000000000033',
      'dec1a55e-0000-0000-0000-000000000034',
      'dec1a55e-0000-0000-0000-000000000035',
    ]) {
      expect(insertCols).toContain(classId);
    }

    // The canonical judge gets class-level rows.
    expect(insertCols).toContain('e2e-judge@test.myk9.com');
    expect(seed).toContain('dededede-0000-0000-0000-0000000000b5');
  });
});
