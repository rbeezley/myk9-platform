import { readFileSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');
const migrationsDir = join(repoRoot, 'supabase/migrations');

function readRepoFile(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8');
}

function migrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort()
    .map(file => join(migrationsDir, file));
}

function latestMigrationContaining(pattern: RegExp): { file: string; sql: string } {
  const match = migrationFiles()
    .map(file => ({ file, sql: readFileSync(file, 'utf8') }))
    .filter(({ sql }) => pattern.test(sql))
    .at(-1);

  expect(match, `No migration matched ${pattern}`).toBeDefined();
  return match!;
}

function sliceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Missing start marker: ${start}`).toBeGreaterThanOrEqual(0);

  const endIndex = source.indexOf(end, startIndex);
  expect(endIndex, `Missing end marker: ${end}`).toBeGreaterThan(startIndex);

  return source.slice(startIndex, endIndex);
}

describe('DB migration sanity contracts', () => {
  it('selects confirmation email entries by unsent timestamp for retry idempotency', () => {
    const source = readRepoFile('supabase/functions/send-confirmation-email/index.ts');
    const entryQuery = sliceBetween(
      source,
      '// Entries not yet sent for this trial',
      'for (const entry'
    );

    expect(entryQuery).toContain(".is('confirmation_email_sent_at', null)");
    expect(entryQuery).toContain(".in('confirmation_email_status', ['pending', 'failed'])");

    const sendLoop = sliceBetween(
      source,
      'for (const entry of entries ?? [])',
      'return { sent, skipped, failed };'
    );
    expect(sendLoop).not.toContain(".update({ confirmation_email_status: 'pending' })");
    expect(sendLoop).toContain("'Idempotency-Key': `confirmation-email-${entry.id}`");
    expect(sendLoop).not.toContain("'Idempotency-Key': `${showStyle}-confirm-${entry.id}`");
  });

  it('keeps the final people_insert_secretary policy role-gated', () => {
    const { file, sql } = latestMigrationContaining(/CREATE POLICY people_insert_secretary/i);
    const policy = sliceBetween(sql, 'CREATE POLICY people_insert_secretary', ';');

    expect(basename(file)).not.toBe('20260602020000_allow_secretary_insert_people.sql');
    expect(policy).toContain(
      "r.name in ('secretary', 'club_admin', 'site_admin', 'platform_admin')"
    );
    expect(policy).toContain('ur.is_active = true');
    expect(policy).toContain('auth_user_id IS NULL');
    expect(policy).not.toContain('auth_user_id IS NULL   -- new person');
  });

  it('keeps delete_show_managed_person scoped to the authorized show', () => {
    const { file, sql } = latestMigrationContaining(/delete_show_managed_person/i);
    const fn = sliceBetween(
      sql,
      'CREATE OR REPLACE FUNCTION public.delete_show_managed_person',
      'GRANT EXECUTE'
    );

    expect(basename(file)).not.toBe('20260524122000_club_role_review_fixes.sql');
    expect(fn).toContain('public.can_manage_show_person_for_show(p_show_id, p_person_id)');
    expect(fn).toContain('RAISE EXCEPTION');
    expect(fn).toContain('Person % is not managed through show %');
  });
});
