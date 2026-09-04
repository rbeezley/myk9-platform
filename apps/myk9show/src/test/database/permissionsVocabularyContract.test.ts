import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@/types/auth-types';

const migrationsDir = resolve(__dirname, '../../../../../supabase/migrations');

function seededPermissionCodes(): Set<string> {
  const codes = new Set<string>();
  for (const filename of readdirSync(migrationsDir).filter(file => file.endsWith('.sql'))) {
    const sql = readFileSync(resolve(migrationsDir, filename), 'utf8');
    for (const match of sql.matchAll(/\(['"]([^'"]+)['"],\s*['"][^'"]+['"],/g)) {
      codes.add(match[1]);
    }
  }
  return codes;
}

describe('app permission vocabulary', () => {
  it('has a matching permissions-table seed for every app permission', () => {
    const seeded = seededPermissionCodes();
    const missing = Object.values(PERMISSIONS).filter(code => !seeded.has(code));

    expect(missing, 'every PERMISSIONS value must be inserted into public.permissions').toEqual(
      []
    );
  });

  it('keeps the reconciliation migration explicit for the formerly phantom codes', () => {
    const migration = readFileSync(
      resolve(migrationsDir, '20260904190000_reconcile_app_permission_vocabulary.sql'),
      'utf8'
    );
    expect(migration.match(/\(['"][^'"]+['"],\s*['"][^'"]+['"],/g)).toHaveLength(25);
  });
});
