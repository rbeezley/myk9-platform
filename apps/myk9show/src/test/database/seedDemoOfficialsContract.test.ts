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
    { role: 'secretary', emails: ['secretary@myk9t.com'] },
    { role: 'club_admin', emails: ['testadmin@myk9t.com'] },
    { role: 'judge', emails: ['judge@myk9t.com'] },
    { role: 'steward', emails: ['secretary@myk9t.com'] },
    { role: 'chairman', emails: ['testadmin@myk9t.com'] },
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
      'testadmin@myk9t.com',
      'judge@myk9t.com',
      'secretary@myk9t.com',
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
    expect(seed).toContain('judge@myk9t.com');
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
    expect(insertCols).toContain('judge@myk9t.com');
    expect(seed).toContain('dededede-0000-0000-0000-0000000000b5');
  });

  it('provides both assigned and unassigned judge subjects', () => {
    const assignmentBlock = seed.slice(
      seed.indexOf('INSERT INTO public.judge_assignments'),
      seed.indexOf('-- 12. GAP FIXTURE', seed.indexOf('INSERT INTO public.judge_assignments'))
    );

    expect(assignmentBlock).toContain('judge@myk9t.com');
    expect(assignmentBlock).toContain('dec1a55e-0000-0000-0000-000000000031');
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
// widening its email list to secretary@myk9t.com, dropping the `r.name <> 'judge'`
// term, and re-declaring the judge fixture as `['judge', 'exhibitor']` each fail
// at least one assertion here.
describe('judge fixture exclusivity contract (MYK9-141)', () => {
  const seed = readSeed();
  const JUDGE_FIXTURE_EMAILS = ['judge@myk9t.com'];
  // Accounts that are deliberately multi-role. e2e-secretary is
  // secretary+steward+exhibitor and e2e-admin is site_admin+4; a widened WHERE
  // clause in 10g would silently destroy both.
  const MULTI_ROLE_FIXTURE_EMAILS = [
    'secretary@myk9t.com',
    'testadmin@myk9t.com',
    'exhibitor@myk9t.com',
    'clubadmin@myk9t.com',
  ];

  function readExclusivityBlock(): string {
    const start = seed.indexOf('-- 10g. JUDGE FIXTURE EXCLUSIVITY');
    expect(start).toBeGreaterThan(-1);
    const end = seed.indexOf('-- 11. GAP FIXTURE #5', start);
    expect(end).toBeGreaterThan(start);
    return seed.slice(start, end);
  }

  // The optional accounts exist only where a secret provisioned their Auth user.
  // Their INSERT halves have always required an auth id; their REACTIVATE halves
  // did not, so a stale people row left by a wiped auth.users would be flipped to
  // an active grant nobody can sign into (Codex review, #1626).
  //
  // 10d joined this set on 2026-08-23 when chairman moved onto its own optional
  // account; 10f (the empty-assignment judge) left it when that fixture was
  // deleted, no spec having ever signed in as it.
  it.each([
    { label: '10d chairman', marker: '-- 10d.', next: '-- 10e.' },
    { label: '10e club admin', marker: '-- 10e.', next: '-- 10g.' },
  ])('guards the $label reactivate half against a null auth identity', ({ marker, next }) => {
    const start = seed.indexOf(marker);
    expect(start).toBeGreaterThan(-1);
    const block = seed.slice(start, seed.indexOf(next, start + marker.length));

    const reactivate = block.slice(0, block.indexOf('INSERT INTO public.user_roles'));
    expect(reactivate).toContain('SET is_active = true');
    expect(reactivate).toContain('p.auth_user_id IS NOT NULL');
  });

  // Every account whose secret no workflow supplies MUST be optional. A required
  // one sends planAccountProvisioning down missingRequired and exit(1)s the whole
  // script — and scripts/qa/isolated-e2e-lifecycle.ts runs it, so one unprovisioned
  // account takes down provisioning for ALL of them. e2e-judge-empty was filed as
  // required with its secret defined nowhere (fourth Codex round on #1626).
  it.each(['clubadmin@myk9t.com', 'chairman@myk9t.com', 'exhibitor2@myk9t.com'])(
    'declares %s optional so a missing secret skips it instead of aborting',
    email => {
      const entry = setupSource.slice(
        setupSource.indexOf(`email: '${email}'`),
        setupSource.indexOf('},', setupSource.indexOf(`email: '${email}'`))
      );
      expect(entry).toContain('optional: true');
    }
  );

  // The isolated seed writes person.auth_user_id straight into the grant, so the
  // hazard is identical on its INSERT halves — guarding only the reactivate side
  // left the INSERT able to create the very row the guard was added to prevent
  // (third Codex round on #1626). Asserted over EVERY user_roles statement in the
  // file rather than the two that were fixed, so a fifth one cannot skip it.
  it('guards every isolated-seed user_roles write on an auth identity', () => {
    const isolated = readFileSync(
      join(repoRoot, 'supabase/seed-isolated-e2e-accounts.sql'),
      'utf8'
    );
    const statements = isolated
      .split(';\n')
      .filter(statement => /(UPDATE|INSERT INTO) public\.user_roles/.test(statement));

    // 2 reactivate + 2 insert, platform-wide and club-scoped.
    expect(statements).toHaveLength(4);
    for (const statement of statements) {
      expect(statement).toContain('person.auth_user_id IS NOT NULL');
    }
  });

  it('deactivates every non-judge grant held by the judge fixture account', () => {
    const block = readExclusivityBlock();

    // Deactivate, not DELETE — 10b reactivates its own row, so ordering is
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

  it('never widens the deactivation past the judge fixture', () => {
    const block = readExclusivityBlock();

    for (const email of MULTI_ROLE_FIXTURE_EMAILS) {
      expect(block).not.toContain(email);
    }

    // Scoped by an explicit email list, never "every account" or "every judge".
    expect(block).toMatch(/lower\(p\.email\)\s+IN\s*\(/);
  });

  // The fixture files claim `roles: ['judge']`. 10b is what makes the claim true,
  // so if a fixture ever adds a second role the seed would silently revoke it at
  // the next reseed — the declarations and the seed must move together.
  const judgeFixtureSources: Array<{ label: string; path: string; pattern: RegExp }> = [
    {
      label: 'e2e fixture (test-users.ts)',
      path: 'apps/myk9show/src/test/e2e/fixtures/test-users.ts',
      pattern: /email: 'judge@myk9t\.com',[\s\S]{0,240}?roles: \['judge'\],/,
    },
    {
      label: 'provisioning script (setup-e2e-test-users.ts)',
      path: 'apps/myk9show/scripts/setup-e2e-test-users.ts',
      pattern: /email: 'judge@myk9t\.com',[\s\S]{0,240}?roles: \['judge'\],/,
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

// The chairman fixture was split off testadmin on 2026-08-23. testadmin holds
// site_admin, so a chairman grant riding on it clears a chairman gate through the
// wrong branch — the same vacuity 10e documents for club scoping, and the same
// reason the club admin was split off it earlier.
//
// This block exists because a mutation proved the split was UNPINNED: moving the
// 10d grant back onto testadmin passed all 37 assertions. The address rename was
// covered; the role relocation, which is the part that changes behaviour, was not.
describe('chairman fixture is its own account (not testadmin)', () => {
  const seed = readSeed();

  function readChairmanGrantBlock(): string {
    const start = seed.indexOf('-- 10d.');
    expect(start).toBeGreaterThan(-1);
    const end = seed.indexOf('-- 10e.', start);
    expect(end).toBeGreaterThan(start);
    return seed.slice(start, end);
  }

  it('grants chairman to the chairman account and to no other', () => {
    const block = readChairmanGrantBlock();

    expect(block).toMatch(/r\.name = 'chairman'/);
    // Asserted over the addresses the block NAMES rather than over an absence:
    // `not.toContain('testadmin')` alone would also pass on a seed that stopped
    // granting chairman to anybody, which is the failure this pins.
    const granteeAddresses = new Set(
      Array.from(block.matchAll(/lower\(p\.email\) = '([^']+)'/g), match => match[1])
    );
    expect([...granteeAddresses]).toEqual(['chairman@myk9t.com']);
  });

  it('does not hand chairman to the site admin anywhere in the seed', () => {
    // Scoped to grant statements: the 10d prose explains the split and names
    // testadmin, which is intentional and must not fail this.
    const grantPairs = Array.from(
      seed.matchAll(/r\.name = '([a-z_]+)'[\s\S]{0,200}?lower\(p\.email\) = '([^']+)'/g),
      match => `${match[2]}:${match[1]}`
    );
    expect(grantPairs).not.toContain('testadmin@myk9t.com:chairman');
  });

  it('declares chairman as its own optional fixture in the provisioning script', () => {
    expect(setupSource).toMatch(
      /email: 'chairman@myk9t\.com',[\s\S]{0,240}?roles: \['chairman'\],/
    );
    // testadmin keeps site_admin, club_admin and exhibitor — only chairman moved.
    expect(setupSource).toMatch(
      /email: 'testadmin@myk9t\.com',[\s\S]{0,240}?roles: \['site_admin', 'secretary', 'club_admin', 'exhibitor'\],/
    );
  });
});
