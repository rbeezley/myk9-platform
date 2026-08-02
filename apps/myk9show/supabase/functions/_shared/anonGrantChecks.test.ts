import { describe, expect, it } from 'vitest';
import { anonGrantsCheck } from './anonGrantChecks';
import { anonGrants } from './anonGrantTestFixtures';

const PROBED_AT = '2026-07-04T12:00:00.000Z';

describe('anonGrantsCheck — exact applied ACL drift', () => {
  it('is ok on the post-MYK9-93 baseline', () => {
    const check = anonGrantsCheck(anonGrants(), PROBED_AT);
    expect(check.status).toBe('ok');
    // 19 table grants: judge_assignments moved to its ten-column allowlist in MYK9-146.
    expect(check.detail).toContain('19 table grants (1 write)');
    expect(check.detail).toContain('86 column grants');
  });

  it('fails when a table not on the allowlist gains an anon grant', () => {
    const grants = anonGrants();
    grants.tables.push({ name: 'dog_favorites', kind: 'r', privs: 'arwdDxtm' });
    const check = anonGrantsCheck(grants, PROBED_AT);
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('dog_favorites');
    expect(check.detail).toContain('not on the anon allowlist');
  });

  it('fails when an allowlisted table gains a write privilege', () => {
    const grants = anonGrants();
    grants.tables = grants.tables.map(t => (t.name === 'shows' ? { ...t, privs: 'rw' } : t));
    const check = anonGrantsCheck(grants, PROBED_AT);
    expect(check.status).toBe('fail');
    expect(check.detail).toContain("shows has 'rw', expected 'r'");
  });

  it('fails when entries gains a table-level grant', () => {
    const grants = anonGrants();
    grants.tables.push({ name: 'entries', kind: 'r', privs: 'r' });
    const check = anonGrantsCheck(grants, PROBED_AT);
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('entries has a TABLE-level anon grant');
  });

  // SA-2026-07-30-02: the monitor used to expect `classes: 'r'` at table level, so it
  // failed the secure state and passed the insecure one — a re-granted table-wide SELECT
  // hands anon back num_hides, has_blank and hides_known (MYK9-116).
  it('fails when classes gains a table-level grant', () => {
    const grants = anonGrants();
    grants.tables.push({ name: 'classes', kind: 'r', privs: 'r' });
    const check = anonGrantsCheck(grants, PROBED_AT);
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('classes has a TABLE-level anon grant');
  });

  it('fails when a scent-work hide column is granted to anon', () => {
    for (const column of ['num_hides', 'has_blank', 'hides_known']) {
      const grants = anonGrants();
      grants.columns.push({ name: 'classes', column, privs: 'r' });
      const check = anonGrantsCheck(grants, PROBED_AT);
      expect(check.status).toBe('fail');
      expect(check.detail).toContain(`unexpected column grant classes.${column}`);
    }
  });

  it('fails when an expected classes column grant disappears', () => {
    const grants = anonGrants();
    grants.columns = grants.columns.filter(
      row => !(row.name === 'classes' && row.column === 'status')
    );
    const check = anonGrantsCheck(grants, PROBED_AT);
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('missing anon column grant classes.status');
  });

  it('fails when a column grant appears on an unexpected table', () => {
    const grants = anonGrants();
    grants.columns.push({ name: 'dog_registrations', column: 'registration_number', privs: 'r' });
    const check = anonGrantsCheck(grants, PROBED_AT);
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('dog_registrations.registration_number');
  });

  it('fails when an allowed table gains an unexpected column grant', () => {
    const grants = anonGrants();
    grants.columns.push({ name: 'people', column: 'phone', privs: 'r' });
    const check = anonGrantsCheck(grants, PROBED_AT);
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('people.phone');
  });

  it('fails when an expected column grant disappears', () => {
    const grants = anonGrants();
    grants.columns = grants.columns.filter(
      row => !(row.name === 'entries' && row.column === 'class_id')
    );
    const check = anonGrantsCheck(grants, PROBED_AT);
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('missing anon column grant entries.class_id');
  });

  it('fails when an expected table grant disappears', () => {
    const grants = anonGrants();
    grants.tables = grants.tables.filter(row => row.name !== 'shows');
    const check = anonGrantsCheck(grants, PROBED_AT);
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('missing anon table grant shows');
  });

  it('fails when a revoked default privilege comes back under another grantor', () => {
    const grants = anonGrants();
    grants.defaults.push({ grantor: 'postgres', objtype: 'r', privs: 'arwdDxtm' });
    const check = anonGrantsCheck(grants, PROBED_AT);
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('restored by postgres');
  });

  it('tolerates the inert supabase_admin default', () => {
    const check = anonGrantsCheck(anonGrants(), PROBED_AT);
    expect(check.status).toBe('ok');
    expect(check.detail).not.toContain('supabase_admin');
  });

  it('warns when the probe predates the anon-grants fact', () => {
    const check = anonGrantsCheck(undefined, PROBED_AT);
    expect(check.status).toBe('warn');
    expect(check.detail).toContain('no anon_grants facts');
  });

  it('never throws on malformed rows; degrades to a visible fail', () => {
    for (const bad of [{ tables: 'nope' }, { tables: [null, 42] }, { columns: [{}] }]) {
      const check = anonGrantsCheck(bad, PROBED_AT);
      expect(['ok', 'warn', 'fail']).toContain(check.status);
    }
    expect(anonGrantsCheck({ tables: [null] }, PROBED_AT).status).toBe('fail');
  });
});
