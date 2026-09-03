import { describe, expect, it } from 'vitest';
import { changedMigrationVersions, migrationVersion } from './migration-version-guard';

describe('migration version guard helpers', () => {
  it('extracts numeric versions from migration filenames', () => {
    expect(migrationVersion('supabase/migrations/20260903174500_add_guard.sql')).toBe('20260903174500');
    expect(migrationVersion('supabase/migrations/README.md')).toBeNull();
  });

  it('deduplicates and sorts changed migration versions', () => {
    expect(
      changedMigrationVersions([
        'supabase/migrations/20260903174500_add_guard.sql',
        'supabase/migrations/20260903174500_add_guard.sql',
        'apps/myk9show/src/example.ts',
        'supabase/migrations/20260903180000_followup.sql',
      ]),
    ).toEqual(['20260903174500', '20260903180000']);
  });
});
