import { describe, expect, it } from 'vitest';
import { DATABASE_ACCESS_RUNBOOK, routeTarget, externalTarget } from './remediationTarget';
describe('validated remediation destinations', () => {
  it.each([
    'https://example.test',
    '//example.test',
    '/\\example.test',
    'javascript:alert(1)',
    '/admin/health\n',
  ])('rejects mixed/unsafe route %s', value => {
    expect(() => routeTarget(value)).toThrow();
  });
  it('accepts existing internal routes and only the approved HTTPS runbook', () => {
    expect(routeTarget('/admin/health')).toEqual({ kind: 'route', href: '/admin/health' });
    expect(externalTarget(DATABASE_ACCESS_RUNBOOK)).toEqual({
      kind: 'external',
      href: DATABASE_ACCESS_RUNBOOK,
    });
    expect(() => externalTarget('http://github.com/rbeezley/myk9-platform')).toThrow();
    expect(() => externalTarget('https://example.test')).toThrow();
  });
});
