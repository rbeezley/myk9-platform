import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Source-text contract for the Lane 1.1 demo reseed (supabase/seed-demo.sql).
//
// The original F1 bug was a role grant that was silently ABSENT from the seed:
// after a reseed the secretary golden path 403'd because nothing granted the
// secretary role. The seed was later extended to guarantee secretary/club_admin,
// and then (this change) judge/steward/chairman plus the named show officials.
//
// These assertions pin the COMPLETENESS of that data so a future edit can't drop
// a grant or an official and still pass review — the failure mode is invisible
// in the app until someone logs in as that role on a freshly-reseeded DB.

const repoRoot = resolve(__dirname, '../../../../..');
const HEARTLAND_CLUB_ID = 'dededede-0000-0000-0000-000000000001';
const HEARTLAND_SHOW_ID = 'dededede-0000-0000-0000-000000000010';

function readSeed(): string {
  return readFileSync(join(repoRoot, 'supabase/seed-demo.sql'), 'utf8');
}

describe('seed-demo officials + RBAC completeness contract', () => {
  const seed = readSeed();

  it('populates the named show officials (chairman / secretary / chief_steward)', () => {
    // Column list and values both present in the shows INSERT.
    expect(seed).toContain('chairman, secretary, chief_steward,');
    expect(seed).toContain("'Test Club', 'Test Secretary', 'Test Steward',");
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
    { role: 'secretary', emails: ['secretary@myk9t.com', 'e2e-secretary@test.myk9.com'] },
    { role: 'club_admin', emails: ['club@myk9t.com', 'e2e-clubadmin@test.myk9.com'] },
    { role: 'judge', emails: ['judge@myk9t.com', 'e2e-judge@test.myk9.com'] },
    { role: 'steward', emails: ['e2e-steward@test.myk9.com'] },
    { role: 'chairman', emails: ['club@myk9t.com', 'e2e-clubadmin@test.myk9.com'] },
  ];

  it.each(grantedRoles)('grants the $role role with a reactivate-then-insert block', ({ role, emails }) => {
    // A revoke-safe grant is an UPDATE (reactivate) + INSERT (fill missing) pair.
    expect(seed).toContain(`SET is_active = true, auth_user_id = p.auth_user_id, expires_at = NULL`);
    expect(seed.includes(`r.name = '${role}'`)).toBe(true);
    // The INSERT for this role must club-scope to Heartland (migration 102 +
    // stability across reseeds) — never a NULL-club_id platform-wide grant.
    const insertForRole = seed.slice(seed.indexOf(`WHERE r.name = '${role}'`));
    expect(insertForRole).toContain(HEARTLAND_CLUB_ID);
    for (const email of emails) {
      expect(seed.toLowerCase()).toContain(email.toLowerCase());
    }
  });

  it('preflights every grant account + role so a missing one fails loud', () => {
    for (const role of ['secretary', 'club_admin', 'judge', 'steward', 'chairman']) {
      expect(seed).toContain(`'${role}'`);
    }
    // The new judge/steward accounts must be in the non-null auth_user_id guard.
    for (const email of [
      'judge@myk9t.com',
      'e2e-judge@test.myk9.com',
      'e2e-steward@test.myk9.com',
    ]) {
      expect(seed).toContain(email);
    }
  });

  it('assigns judges to BOTH trials and both judge accounts', () => {
    // judge_assignments cover the route INTO ringside (scheduling surface).
    expect(seed).toContain(HEARTLAND_SHOW_ID);
    // Both trial ids appear as assignment targets.
    expect(seed).toContain('dededede-0000-0000-0000-000000000021'); // Saturday
    expect(seed).toContain('dededede-0000-0000-0000-000000000022'); // Sunday
    // Three fixed assignment ids (...071 Sat, ...072 Sun, ...073 e2e-judge Sat).
    for (const id of [
      'dededede-0000-0000-0000-000000000071',
      'dededede-0000-0000-0000-000000000072',
      'dededede-0000-0000-0000-000000000073',
    ]) {
      expect(seed).toContain(id);
    }
  });
});
