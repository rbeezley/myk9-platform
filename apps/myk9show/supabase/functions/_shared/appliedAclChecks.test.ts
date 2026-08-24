import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AUTHENTICATED_TABLE_GRANTS,
  SERVICE_ROLE_TABLE_GRANTS,
  appliedAclCheck,
} from './appliedAclChecks';
import { appliedAclFacts } from './appliedAclTestFixtures';

const sql = readFileSync(
  resolve(__dirname, '../../../../../supabase/tests/pre_rule_table_grants_test.sql'),
  'utf8'
);

/** Section A's `expected(tbl, authenticated, anon, service_role)` VALUES list. */
const sqlGrantRows = [
  ...sql
    .split('WITH expected(tbl, authenticated, anon, service_role) AS (VALUES')[1]
    .split('\n  )')[0]
    .matchAll(/^\s*\('([a-z_]+)','([^']*)','([^']*)','([^']*)'\),?\s*$/gm),
];

const sqlAuthenticatedGrants = Object.fromEntries(
  sqlGrantRows.map(m => [m[1], m[2]])
);

const sqlServiceRoleGrants = Object.fromEntries(
  sqlGrantRows.map(m => [m[1], m[4]])
);

const PROBED_AT = '2026-08-04T12:00:00.000Z';

describe('appliedAclCheck — authenticated and sequence ACL drift', () => {
  it('is ok on the codified applied ACL baseline', () => {
    const check = appliedAclCheck(appliedAclFacts(), PROBED_AT);

    expect(check.status).toBe('ok');
    // Counted from the SQL contract, not written as a literal. Two PRs each
    // adding one table would both have bumped a literal 127 to 128 -- an
    // identical edit on both sides, which git merges CLEANLY and silently,
    // leaving main asserting 128 against a 129-entry map.
    expect(check.detail).toContain(
      `${Object.keys(sqlAuthenticatedGrants).length} authenticated and ` +
        `${Object.keys(sqlServiceRoleGrants).length} service_role table grants`
    );
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

  it('fails when sms_proximity_sends service_role privileges drift from the hosted contract', () => {
    const facts = appliedAclFacts();
    facts.service_role_tables = facts.service_role_tables.map(row =>
      row.name === 'sms_proximity_sends' ? { ...row, privs: 'SELECT,INSERT,DELETE' } : row
    );

    const check = appliedAclCheck(facts, PROBED_AT);

    expect(check.status).toBe('fail');
    expect(check.detail).toContain(
      "sms_proximity_sends has 'SELECT,INSERT,DELETE', expected 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'"
    );
  });

  it('fails when a service_role table grant is missing, unexpected, duplicated, or malformed', () => {
    const missing = appliedAclFacts();
    missing.service_role_tables = missing.service_role_tables.filter(row => row.name !== 'shows');
    expect(appliedAclCheck(missing, PROBED_AT).detail).toContain(
      'missing service_role table grant shows'
    );

    const unexpected = appliedAclFacts();
    unexpected.service_role_tables.push({ name: 'uncontracted_table', privs: 'SELECT' });
    expect(appliedAclCheck(unexpected, PROBED_AT).detail).toContain(
      'uncontracted_table (SELECT) is not in the service_role table contract'
    );

    const duplicate = appliedAclFacts();
    duplicate.service_role_tables.push(duplicate.service_role_tables[0]);
    expect(appliedAclCheck(duplicate, PROBED_AT).detail).toContain(
      `duplicate service_role table grant ${duplicate.service_role_tables[0].name}`
    );

    expect(
      appliedAclCheck({ ...appliedAclFacts(), service_role_tables: [null] }, PROBED_AT).detail
    ).toContain('malformed service_role table grant fact');
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

/**
 * The drift guard this file was missing.
 *
 * `appliedAclTestFixtures.ts` builds its `tables` fixture BY MAPPING OVER
 * `AUTHENTICATED_TABLE_GRANTS`, so every assertion above compares the map to
 * itself and passes no matter what the database or the SQL contract says. That
 * is exactly how `calendar_feed_tokens` (migration 20260816130000) reached
 * production red: its author correctly added the row to the SQL contract, the
 * TS copy was never updated, and no test could tell.
 *
 * This block is non-vacuous because it reads the OTHER file. The module header
 * calls `pre_rule_table_grants_test.sql` the source of truth and this map "the
 * runner's independent expected-value map" — independent in derivation, not in
 * content. Two copies of one contract need a test that they still agree, or
 * the second copy silently becomes fiction.
 */
describe('AUTHENTICATED_TABLE_GRANTS agrees with the SQL contract', () => {
  it('parses the SQL contract at all (guards the split/regex against a reformat)', () => {
    // A silently-empty parse would make every assertion below vacuous — the
    // very failure mode this block exists to prevent.
    expect(Object.keys(sqlAuthenticatedGrants).length).toBeGreaterThan(100);
  });

  it('covers exactly the same tables', () => {
    expect(Object.keys(AUTHENTICATED_TABLE_GRANTS).sort()).toEqual(
      Object.keys(sqlAuthenticatedGrants).sort()
    );
  });

  it('agrees on the authenticated privileges for every table', () => {
    const disagreements = Object.entries(sqlAuthenticatedGrants)
      .filter(([table, privs]) => AUTHENTICATED_TABLE_GRANTS[table] !== privs)
      .map(([table, privs]) => `${table}: SQL='${privs}' TS='${AUTHENTICATED_TABLE_GRANTS[table]}'`);

    expect(disagreements).toEqual([]);
  });
});

describe('SERVICE_ROLE_TABLE_GRANTS agrees with the deployed SQL contract', () => {
  it('covers exactly the same tables and privileges', () => {
    expect(Object.keys(SERVICE_ROLE_TABLE_GRANTS).sort()).toEqual(
      Object.keys(sqlServiceRoleGrants).sort()
    );
    expect(
      Object.entries(sqlServiceRoleGrants)
        .filter(([table, privs]) => SERVICE_ROLE_TABLE_GRANTS[table] !== privs)
        .map(
          ([table, privs]) =>
            `${table}: SQL='${privs}' TS='${SERVICE_ROLE_TABLE_GRANTS[table]}'`
        )
    ).toEqual([]);
  });

  it('records the hosted default on sms_proximity_sends and the deliberate entry-history exception', () => {
    expect(SERVICE_ROLE_TABLE_GRANTS.sms_proximity_sends).toBe(
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
    );
    expect(SERVICE_ROLE_TABLE_GRANTS.entry_status_history).toBe(
      'SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
    );
  });
});
