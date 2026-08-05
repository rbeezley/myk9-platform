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
const setupSource = readFileSync(
  join(repoRoot, 'apps/myk9show/scripts/setup-e2e-test-users.ts'),
  'utf8'
);

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

  it('provides assigned, unassigned, and no-assignment judge subjects', () => {
    expect(setupSource).toMatch(
      /email: 'e2e-judge-empty@test\.myk9\.com',[\s\S]*?passwordEnv: 'E2E_JUDGE_EMPTY_PASSWORD',[\s\S]*?roles: \['judge'\]/
    );

    const assignmentBlock = seed.slice(
      seed.indexOf('INSERT INTO public.judge_assignments'),
      seed.indexOf('-- 12. GAP FIXTURE', seed.indexOf('INSERT INTO public.judge_assignments'))
    );

    expect(assignmentBlock).toContain('e2e-judge@test.myk9.com');
    expect(assignmentBlock).toContain('dec1a55e-0000-0000-0000-000000000031');
    expect(assignmentBlock).not.toContain('e2e-judge-empty@test.myk9.com');
    expect(seed).toContain('dec1a55e-0000-0000-0000-000000000036');
    expect(assignmentBlock).not.toContain('dec1a55e-0000-0000-0000-000000000036');
  });
});

// Every grant block above only ADDS a role. That is what a revoke-safe seed must
// do, and it is also why an account can never be proven to hold ONLY the role its
// fixture claims: user_roles rows accumulate and nothing takes them away. The
// judge fixture had drifted to secretary + judge + exhibitor by 2026-08-01, which
// makes judge-only authorization tests vacuous — a judge that also holds
// exhibitor clears an exhibitor gate through the exhibitor grant.
//
// These pin the section 10g exclusivity step. Verified non-vacuous by mutation:
// deleting the 10f block, widening its email list to e2e-secretary, dropping the
// `r.name <> 'judge'` term, and re-declaring the judge fixture as
// `['judge', 'exhibitor']` each fail at least one assertion here.
describe('judge fixture exclusivity contract (MYK9-141)', () => {
  const seed = readSeed();
  const JUDGE_FIXTURE_EMAILS = ['e2e-judge@test.myk9.com', 'e2e-judge-empty@test.myk9.com'];
  // Accounts that are deliberately multi-role. e2e-secretary is
  // secretary+steward+exhibitor and e2e-admin is site_admin+4; a widened WHERE
  // clause in 10f would silently destroy both.
  const MULTI_ROLE_FIXTURE_EMAILS = [
    'e2e-secretary@test.myk9.com',
    'e2e-admin@test.myk9.com',
    'e2e-exhibitor@test.myk9.com',
    'e2e-club-admin@test.myk9.com',
  ];

  function readExclusivityBlock(): string {
    const start = seed.indexOf('-- 10g. JUDGE FIXTURE EXCLUSIVITY');
    expect(start).toBeGreaterThan(-1);
    const end = seed.indexOf('-- 11. GAP FIXTURE #5', start);
    expect(end).toBeGreaterThan(start);
    return seed.slice(start, end);
  }

  // An exclusivity sweep on an account that was never GRANTED anything leaves it
  // with no roles at all, which is worse than the drift it fixes: the fixture
  // authenticates and then 403s, so the empty-dashboard case is unreachable.
  // e2e-judge-empty was declared in three TS files and granted in none (caught in
  // Codex review of #1626), so both halves have to be pinned together.
  it('grants the empty-assignment fixture the judge role it is swept down to', () => {
    const start = seed.indexOf('-- 10f. judge -> e2e-judge-empty@test.myk9.com');
    expect(start).toBeGreaterThan(-1);
    const block = seed.slice(start, seed.indexOf('-- 10g. JUDGE FIXTURE EXCLUSIVITY', start));

    // Same revoke-safe reactivate-then-insert shape as every grant above.
    expect(block).toContain(
      'SET is_active = true, auth_user_id = p.auth_user_id, expires_at = NULL'
    );
    expect(block).toContain('INSERT INTO public.user_roles');
    expect(block).toMatch(/r\.name = 'judge'/);
    expect(block).toContain(HEARTLAND_CLUB_ID);

    // Provisioning needs an Auth user (E2E_JUDGE_EMPTY_PASSWORD). Without the
    // guard an unprovisioned account would insert a NULL auth_user_id row.
    expect(block).toContain('p.auth_user_id IS NOT NULL');
  });

  it('provisions the empty-assignment fixture in the isolated account seed too', () => {
    // seed-demo runs against the shared/demo database; the isolated Playwright
    // lifecycle seeds its own disposable one from this second file. A fixture
    // present in only one of them works in exactly one environment.
    const isolated = readFileSync(
      join(repoRoot, 'supabase/seed-isolated-e2e-accounts.sql'),
      'utf8'
    );

    // people rows (reactivate + insert), the judge grant, and the onboarding
    // bypass — without the last one the account lands on the first-run wizard
    // instead of the judge dashboard.
    expect(isolated).toMatch(
      /\('e2e-judge-empty@test\.myk9\.com', 'Test', 'Judge No Assignments'\),/
    );
    expect(isolated).toMatch(/\('e2e-judge-empty@test\.myk9\.com', 'judge'\),/);
    expect(isolated).toContain("  'e2e-judge-empty@test.myk9.com',\n");

    // Absent from the hard count assertion on purpose: like the club admin, this
    // account is optional, and a run without its secret must still seed.
    const countGuard = isolated.slice(
      isolated.indexOf('SELECT count(*)'),
      isolated.indexOf('END\n$$;')
    );
    expect(countGuard).not.toContain('e2e-judge-empty@test.myk9.com');
  });

  it('deactivates every non-judge grant held by the judge fixture accounts', () => {
    const block = readExclusivityBlock();

    // Deactivate, not DELETE — 10b/10f reactivate their own rows, so ordering is
    // not load-bearing and the seed stays revoke-safe.
    expect(block).toContain('SET is_active = false');
    expect(block).not.toContain('DELETE FROM public.user_roles');

    // The exclusion term is what makes this "only judge" instead of "no roles".
    expect(block).toMatch(/r\.name\s*<>\s*'judge'/);

    // Idempotent: already-inactive rows are not re-touched, so a clean re-run is
    // UPDATE 0 (same property every block above holds).
    expect(block).toMatch(/AND\s+ur\.is_active\b/);

    for (const email of JUDGE_FIXTURE_EMAILS) {
      expect(block).toContain(email);
    }
  });

  it('never widens the deactivation past the two judge fixtures', () => {
    const block = readExclusivityBlock();

    for (const email of MULTI_ROLE_FIXTURE_EMAILS) {
      expect(block).not.toContain(email);
    }

    // Scoped by an explicit email list, never "every account" or "every judge".
    expect(block).toMatch(/lower\(p\.email\)\s+IN\s*\(/);
  });

  // The fixture files claim `roles: ['judge']`. 10f is what makes the claim true,
  // so if a fixture ever adds a second role the seed would silently revoke it at
  // the next reseed — the declarations and the seed must move together.
  const judgeFixtureSources: Array<{ label: string; path: string; pattern: RegExp }> = [
    {
      label: 'e2e fixture (test-users.ts)',
      path: 'apps/myk9show/src/test/e2e/fixtures/test-users.ts',
      pattern: /email: 'e2e-judge@test\.myk9\.com',[\s\S]{0,240}?roles: \['judge'\],/,
    },
    {
      label: 'e2e fixture (test-users.ts, empty-assignment account)',
      path: 'apps/myk9show/src/test/e2e/fixtures/test-users.ts',
      pattern: /email: 'e2e-judge-empty@test\.myk9\.com',[\s\S]{0,240}?roles: \['judge'\],/,
    },
    {
      label: 'provisioning script (setup-e2e-test-users.ts)',
      path: 'apps/myk9show/scripts/setup-e2e-test-users.ts',
      pattern: /email: 'e2e-judge@test\.myk9\.com',[\s\S]{0,240}?roles: \['judge'\],/,
    },
  ];

  it.each(judgeFixtureSources)(
    'declares the judge as judge-only in $label',
    ({ path, pattern }) => {
      expect(readFileSync(join(repoRoot, path), 'utf8')).toMatch(pattern);
    }
  );

  it('keeps the judge-only invariant discoverable from the fixture itself', () => {
    // A future editor reading only the fixture must learn that the single role is
    // deliberate and where it is enforced, or the next drift repeats silently.
    for (const path of [
      'apps/myk9show/src/test/e2e/fixtures/test-users.ts',
      'apps/myk9show/src/test/e2e/helpers/testUsers.ts',
    ]) {
      expect(readFileSync(join(repoRoot, path), 'utf8')).toContain('MYK9-141');
    }
  });
});
