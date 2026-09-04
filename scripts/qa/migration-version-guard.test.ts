import { describe, expect, it } from 'vitest';
import {
  changedMigrationVersions,
  currentBranchName,
  isCurrentBranchRef,
  migrationVersion,
} from './migration-version-guard';

describe('migration version guard helpers', () => {
  it('extracts numeric versions from migration filenames', () => {
    expect(migrationVersion('supabase/migrations/20260903174500_add_guard.sql')).toBe(
      '20260903174500'
    );
    expect(migrationVersion('supabase/migrations/README.md')).toBeNull();
  });

  it('deduplicates and sorts changed migration versions', () => {
    expect(
      changedMigrationVersions([
        'supabase/migrations/20260903174500_add_guard.sql',
        'supabase/migrations/20260903174500_add_guard.sql',
        'apps/myk9show/src/example.ts',
        'supabase/migrations/20260903180000_followup.sql',
      ])
    ).toEqual(['20260903174500', '20260903180000']);
  });

  it('recognizes the checked-out branch ref so push checkout refs are not false positives', () => {
    expect(
      currentBranchName({ GITHUB_HEAD_REF: '', GITHUB_REF_NAME: 'codex/fix-linear-findings' })
    ).toBe('codex/fix-linear-findings');
    expect(
      isCurrentBranchRef(
        'refs/remotes/origin/codex/fix-linear-findings',
        'codex/fix-linear-findings'
      )
    ).toBe(true);
    expect(isCurrentBranchRef('refs/remotes/origin/main', 'codex/fix-linear-findings')).toBe(false);
  });
});
