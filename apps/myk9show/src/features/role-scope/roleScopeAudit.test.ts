import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '../../../../..');

function readMigration(name: string) {
  return readFileSync(join(repoRoot, 'supabase/migrations', name), 'utf8');
}

describe('role scope guardrails', () => {
  it('people and dog access policies do not grant broad secretary-anywhere writes', () => {
    const migration = readMigration('20260524121000_scope_secretary_people_dog_access.sql');

    expect(migration).not.toMatch(/is_trial_secretary\(\)/);
    expect(migration).not.toMatch(/is_show_secretary\(\)/);
    expect(migration).toContain('can_manage_show(e.show_id)');
    expect(migration).toContain('create_show_managed_person');
    expect(migration).toContain('create_show_managed_dog');
  });
});
