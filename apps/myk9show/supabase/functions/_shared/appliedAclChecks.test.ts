import { describe, expect, it } from 'vitest';
import { appliedAclCheck } from './appliedAclChecks';
import { appliedAclFacts } from './appliedAclTestFixtures';

const PROBED_AT = '2026-08-04T12:00:00.000Z';

describe('appliedAclCheck — authenticated and sequence ACL drift', () => {
  it('is ok on the codified applied ACL baseline', () => {
    const check = appliedAclCheck(appliedAclFacts(), PROBED_AT);

    expect(check.status).toBe('ok');
    expect(check.detail).toContain('123 authenticated table grants');
    expect(check.detail).toContain('4 public sequences');
  });

  it('fails when authenticated table CRUD drifts', () => {
    const facts = appliedAclFacts();
    facts.tables = facts.tables.map(row =>
      row.name === 'shows' ? { ...row, privs: 'SELECT' } : row
    );

    const check = appliedAclCheck(facts, PROBED_AT);

    expect(check.status).toBe('fail');
    expect(check.detail).toContain("shows has 'SELECT', expected 'SELECT,INSERT,UPDATE,DELETE'");
  });

  it('fails when an authenticated table grant is missing', () => {
    const facts = appliedAclFacts();
    facts.tables = facts.tables.filter(row => row.name !== 'shows');

    const check = appliedAclCheck(facts, PROBED_AT);

    expect(check.status).toBe('fail');
    expect(check.detail).toContain('missing authenticated table grant shows');
  });

  it('fails when an API role holds an RLS-unconstrained table privilege', () => {
    const facts = appliedAclFacts({
      forbidden_tables: [{ name: 'entries', role: 'authenticated', privs: 'TRUNCATE' }],
    });

    const check = appliedAclCheck(facts, PROBED_AT);

    expect(check.status).toBe('fail');
    expect(check.detail).toContain('authenticated holds TRUNCATE on entries');
  });

  it('fails when a sequence ACL drifts from the codified set', () => {
    const facts = appliedAclFacts();
    facts.sequences = facts.sequences.map(row =>
      row.name === 'registration_confirmation_seq' && row.role === 'authenticated'
        ? { ...row, privs: 'SELECT,UPDATE,USAGE' }
        : row
    );

    const check = appliedAclCheck(facts, PROBED_AT);

    expect(check.status).toBe('fail');
    expect(check.detail).toContain(
      "registration_confirmation_seq/authenticated has 'SELECT,UPDATE,USAGE', expected 'SELECT,USAGE'"
    );
  });

  it('fails when a revoked sequence default privilege returns under a new grantor', () => {
    const facts = appliedAclFacts({
      defaults: [{ grantor: 'postgres', role: 'PUBLIC', objtype: 'S', privs: 'USAGE' }],
    });

    const check = appliedAclCheck(facts, PROBED_AT);

    expect(check.status).toBe('fail');
    expect(check.detail).toContain('sequence defaults for PUBLIC restored by postgres');
  });

  it('warns when the probe predates the applied ACL fact block', () => {
    const check = appliedAclCheck(undefined, PROBED_AT);

    expect(check.status).toBe('warn');
    expect(check.detail).toContain('no applied_acl_grants facts');
  });

  it('never throws on malformed facts; malformed rows fail visibly', () => {
    expect(() => appliedAclCheck({ tables: [null], sequences: [{}] }, PROBED_AT)).not.toThrow();
    expect(appliedAclCheck({ tables: [null] }, PROBED_AT).status).toBe('fail');
  });
});
