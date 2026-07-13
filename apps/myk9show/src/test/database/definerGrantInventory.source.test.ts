/**
 * Task 9.2 (go-live-2026-07-11-gate-remediation) — source/call-site contract tests
 * for the SECURITY DEFINER grant inventory and its draft hardening migration.
 *
 * Guards:
 *  - every function in the inventory JSON is dispositioned;
 *  - the draft migration only fully revokes anon where the inventory shows no
 *    anon call-site evidence (disposition !== 'anon-preserving', no live anon grant);
 *  - anon-preserving functions keep their anon EXECUTE grant;
 *  - unconfident functions are omitted from the migration entirely.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../../../../..');

interface InventoryFunction {
  schema: string;
  function_name: string;
  identity_args: string;
  current_grants: { public_execute: boolean; direct_grants: string[] };
  desired_roles: string[];
  disposition: 'service-only' | 'authenticated' | 'anon-preserving' | 'unconfident';
  notes: string;
}

interface Inventory {
  summary: { total: number; byDisposition: Record<string, number> };
  functions: InventoryFunction[];
}

const inventory: Inventory = JSON.parse(
  readFileSync(
    resolve(repoRoot, 'docs/audits/2026-07-go-live-advisors/definer-function-inventory.json'),
    'utf8'
  )
);

const migrationSql = readFileSync(
  resolve(
    repoRoot,
    'supabase/migrations/20260713090000_draft_definer_grant_hardening_pending_review.sql'
  ),
  'utf8'
);

/** Parse REVOKE EXECUTE statements: name -> revoked roles. */
function parseRevokes(sql: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const re = /REVOKE EXECUTE ON FUNCTION public\.(\w+)\([^)]*\) FROM ([^;]+);/g;
  for (const m of sql.matchAll(re)) {
    map.set(m[1], (map.get(m[1]) ?? []).concat(m[2].split(',').map(r => r.trim())));
  }
  return map;
}

/** Parse GRANT EXECUTE statements: name -> granted roles. */
function parseGrants(sql: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const re = /GRANT EXECUTE ON FUNCTION public\.(\w+)\([^)]*\) TO ([^;]+);/g;
  for (const m of sql.matchAll(re)) {
    // Only statements above the rollback comment block are live SQL.
    map.set(m[1], (map.get(m[1]) ?? []).concat(m[2].split(',').map(r => r.trim())));
  }
  return map;
}

const liveSql = migrationSql.split('-- ROLLBACK SQL')[0];
const revokes = parseRevokes(liveSql);
const grants = parseGrants(liveSql);

const VALID_DISPOSITIONS = ['service-only', 'authenticated', 'anon-preserving', 'unconfident'];

describe('definer-function-inventory.json completeness', () => {
  it('has a non-trivial inventory matching its summary count', () => {
    expect(inventory.functions.length).toBeGreaterThan(100);
    expect(inventory.functions.length).toBe(inventory.summary.total);
  });

  it('dispositions every function with a valid value', () => {
    for (const fn of inventory.functions) {
      expect(VALID_DISPOSITIONS, `invalid disposition for ${fn.function_name}`).toContain(
        fn.disposition
      );
    }
  });

  it('gives every function a desired_roles set that includes service_role (except unconfident)', () => {
    for (const fn of inventory.functions) {
      if (fn.disposition === 'unconfident') continue;
      expect(fn.desired_roles, fn.function_name).toContain('service_role');
    }
  });
});

describe('draft migration <-> inventory contract', () => {
  const byName = new Map(inventory.functions.map(f => [f.function_name, f]));

  it('covers every dispositioned function and omits unconfident ones', () => {
    for (const fn of inventory.functions) {
      if (fn.disposition === 'unconfident') {
        expect(revokes.has(fn.function_name), `${fn.function_name} must be omitted`).toBe(false);
        expect(grants.has(fn.function_name), `${fn.function_name} must be omitted`).toBe(false);
      } else {
        expect(revokes.has(fn.function_name), `${fn.function_name} missing REVOKE`).toBe(true);
        expect(grants.has(fn.function_name), `${fn.function_name} missing GRANT`).toBe(true);
      }
    }
  });

  it('contains no function absent from the inventory', () => {
    for (const name of revokes.keys()) {
      expect(byName.has(name), `migration revokes unknown function ${name}`).toBe(true);
    }
    for (const name of grants.keys()) {
      expect(byName.has(name), `migration grants unknown function ${name}`).toBe(true);
    }
  });

  it('only revokes anon on functions with no anon call-site evidence', () => {
    for (const [name, roles] of revokes) {
      if (!roles.includes('anon')) continue;
      const fn = byName.get(name);
      expect(fn, name).toBeDefined();
      expect(fn?.disposition, `${name} revokes anon but is anon-preserving`).not.toBe(
        'anon-preserving'
      );
      expect(
        fn?.desired_roles.includes('anon'),
        `${name} revokes anon but desired_roles keeps anon`
      ).toBe(false);
      // No anon evidence recorded: functions with a live anon grant are all
      // dispositioned anon-preserving; a full anon revoke must not hit one.
      expect(
        fn?.current_grants.direct_grants.includes('anon'),
        `${name} has a live anon grant but the migration revokes anon`
      ).toBe(false);
    }
  });

  it('preserves anon EXECUTE on every anon-preserving function', () => {
    const anonPreserving = inventory.functions.filter(f => f.disposition === 'anon-preserving');
    expect(anonPreserving.length).toBeGreaterThan(0);
    for (const fn of anonPreserving) {
      const revokedRoles = revokes.get(fn.function_name) ?? [];
      expect(
        revokedRoles.includes('anon'),
        `${fn.function_name} is anon-preserving but migration revokes anon`
      ).toBe(false);
      expect(revokedRoles, fn.function_name).toContain('PUBLIC');
      expect(grants.get(fn.function_name), `${fn.function_name} must re-grant anon`).toContain(
        'anon'
      );
    }
  });

  it('revokes PUBLIC on every dispositioned function', () => {
    for (const fn of inventory.functions) {
      if (fn.disposition === 'unconfident') continue;
      expect(revokes.get(fn.function_name), fn.function_name).toContain('PUBLIC');
    }
  });

  it('is clearly marked as pending review and never applied blind', () => {
    expect(migrationSql).toContain('PENDING REVIEW');
    expect(migrationSql).toContain('DO NOT APPLY WITHOUT SIGN-OFF');
    expect(migrationSql).toContain('ROLLBACK SQL');
  });
});
