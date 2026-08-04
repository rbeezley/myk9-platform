import { describe, expect, it } from 'vitest';
import { publicSchemaCreateAclCheck } from './publicSchemaAclChecks';
import { publicSchemaAclFacts } from './publicSchemaAclTestFixtures';

const PROBED_AT = '2026-08-04T12:00:00.000Z';

describe('publicSchemaCreateAclCheck — MYK9-151', () => {
  it('is green when every API role lacks CREATE on public', () => {
    const check = publicSchemaCreateAclCheck(publicSchemaAclFacts(), PROBED_AT);

    expect(check.status).toBe('ok');
    expect(check.detail).toContain('cannot CREATE in public');
  });

  it('fails when an API role regains CREATE on public', () => {
    const facts = publicSchemaAclFacts();
    facts.roles[1] = { role: 'authenticated', can_create: true };

    const check = publicSchemaCreateAclCheck(facts, PROBED_AT);

    expect(check.status).toBe('fail');
    expect(check.detail).toContain('authenticated can CREATE in public');
  });

  it('fails on a probe violation even if role rows are incomplete', () => {
    const check = publicSchemaCreateAclCheck({ roles: [], violations: ['anon'] }, PROBED_AT);

    expect(check.status).toBe('fail');
    expect(check.detail).toContain('anon can CREATE in public');
  });

  it('warns when the probe has not been applied yet', () => {
    const check = publicSchemaCreateAclCheck(undefined, PROBED_AT);

    expect(check.status).toBe('warn');
    expect(check.detail).toContain('no public schema ACL facts');
  });
});
