/** MYK9-151 / SA-027 — applied public-schema CREATE ACL drift detection. */

import type { SnapshotCheck } from './systemHealthChecks.ts';

interface RoleFact {
  role: string;
  canCreate: boolean;
}

const API_ROLES = ['anon', 'authenticated', 'service_role'] as const;

function parseRoleFacts(raw: unknown): RoleFact[] {
  if (!Array.isArray(raw)) return [];

  return raw.flatMap(value => {
    if (!value || typeof value !== 'object') return [];
    const row = value as Record<string, unknown>;
    return typeof row.role === 'string' && typeof row.can_create === 'boolean'
      ? [{ role: row.role, canCreate: row.can_create }]
      : [];
  });
}

/** Judge `public_schema_create_acl_probe()` facts for the daily snapshot. */
export function publicSchemaCreateAclCheck(rawFacts: unknown, probedAt: string): SnapshotCheck {
  const base = {
    key: 'public_schema_create_acl',
    label: 'Public schema CREATE ACL',
    checked_at: probedAt,
  } as const;

  if (!rawFacts || typeof rawFacts !== 'object') {
    return { ...base, status: 'warn', detail: 'probe returned no public schema ACL facts' };
  }

  const facts = rawFacts as Record<string, unknown>;
  if (typeof facts.error === 'string') {
    return { ...base, status: 'fail', detail: `public schema ACL probe failed: ${facts.error}` };
  }
  const rows = parseRoleFacts(facts.roles);
  const violations = Array.isArray(facts.violations)
    ? facts.violations.filter((value): value is string => typeof value === 'string')
    : [];
  const problems: string[] = [];

  for (const role of API_ROLES) {
    const matching = rows.filter(row => row.role === role);
    if (matching.length !== 1) {
      problems.push(`missing or duplicate ${role} CREATE fact`);
    } else if (matching[0].canCreate) {
      problems.push(`${role} can CREATE in public`);
    }
  }

  for (const role of violations) {
    if (!problems.includes(`${role} can CREATE in public`)) {
      problems.push(`${role} can CREATE in public`);
    }
  }

  if (problems.length > 0) {
    return { ...base, status: 'fail', detail: problems.join('; ') };
  }

  return {
    ...base,
    status: 'ok',
    detail: 'anon, authenticated, and service_role cannot CREATE in public',
  };
}
