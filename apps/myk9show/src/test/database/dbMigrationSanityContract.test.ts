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

  it('hardens legacy advisor RLS warnings without closing waitlist signup', () => {
    const { sql } = latestMigrationContaining(/Security advisor follow-up/i);
    const waitlistPolicy = sliceBetween(sql, 'create policy "anon_can_insert_waitlist"', ');');

    expect(sql).toContain('drop policy if exists "announcements_all"');
    expect(sql).toContain('drop policy if exists "announcement_reads_insert"');
    expect(sql).toContain('drop policy if exists "entry_status_history_select"');
    expect(sql).toContain('drop policy if exists "entry_status_history_insert"');
    expect(sql).toContain('drop policy if exists "Anyone can join the waitlist"');
    expect(sql).toContain('drop policy if exists "site_admins_read_waitlist"');
    expect(sql).toContain('grant select on table public.entry_status_history to authenticated');
    expect(sql).not.toContain('grant select on table public.entry_status_history to anon');
    expect(sql).toContain('revoke all on table public.platform_waitlist from anon, authenticated');
    expect(sql).toContain('grant insert on table public.platform_waitlist to anon, authenticated');
    expect(sql).toContain('create policy "site_admins_read_waitlist"');
    expect(waitlistPolicy).toContain('length(btrim(email)) between 3 and 320');
    expect(waitlistPolicy).toContain("position('@' in email) > 1");
    expect(waitlistPolicy).not.toContain('with check (true)');
  });

  it('captures every entry status transition and scopes history to show staff', () => {
    const { sql } = latestMigrationContaining(/record_entry_status_history/i);

    expect(sql).toContain('AFTER UPDATE OF entry_status ON public.entries');
    expect(sql).toContain('OLD.entry_status');
    expect(sql).toContain('NEW.entry_status');
    expect(sql).toContain('auth.uid()');
    expect(sql).toContain('DROP POLICY IF EXISTS "entry_status_history_select"');
    expect(sql).toContain('public.is_show_official(e.show_id)');
    expect(sql).toContain('public.is_club_admin(s.club_id)');
    expect(sql).not.toContain('USING (true)');
  });

  it('keeps own-entry results visible for every non-draft, non-cancelled show state', () => {
    // Match the DDL marker, not any prose mention — later migrations may reference the view name
    // in comments (e.g. function-grant sweeps) without redefining it.
    const { sql } = latestMigrationContaining(/VIEW public\.view_own_entry_results/i);
    const view = sliceBetween(sql, 'VIEW public.view_own_entry_results', 'GRANT SELECT');

    expect(view).toContain('security_invoker = true');
    expect(view).toContain(
      "sh.status IN ('published', 'accepting_entries', 'closed', 'in_progress', 'completed')"
    );
  });

  it('derives class status from non-deleted entries only', () => {
    const { sql } = latestMigrationContaining(
      /deleted_at[\s\S]*entries_refresh_class_scoring_state/i
    );
    const refreshFunction = sliceBetween(
      sql,
      'CREATE OR REPLACE FUNCTION public.refresh_class_scoring_state',
      'COMMENT ON FUNCTION public.refresh_class_scoring_state'
    );
    const trigger = sliceBetween(
      sql,
      'CREATE TRIGGER entries_refresh_class_scoring_state',
      'ALTER TABLE public.classes DISABLE TRIGGER trg_notify_class_status_push'
    );

    expect(refreshFunction).toContain('FROM public.entries');
    expect(refreshFunction).toContain('AND deleted_at IS NULL');
    expect(refreshFunction).toContain('COUNT(*) FILTER (WHERE is_scored = true)::integer');
    expect(refreshFunction).toContain('WHERE class_id = p_class_id\n      AND deleted_at IS NULL');
    expect(sql).toContain('NEW.deleted_at IS NULL');
    expect(trigger).toContain('deleted_at');
    expect(sql).toContain(
      'ALTER TABLE public.classes DISABLE TRIGGER trg_notify_class_status_push'
    );
    expect(sql).toContain('PERFORM public.refresh_class_scoring_state(r.id);');
    expect(sql).toContain('ALTER TABLE public.classes ENABLE TRIGGER trg_notify_class_status_push');
  });

  it('only reopens a class after a completed closeout', () => {
    const { sql } = latestMigrationContaining(
      /CREATE OR REPLACE FUNCTION public\.handle_entry_scoring_state_change/i
    );
    const handler = sliceBetween(
      sql,
      'CREATE OR REPLACE FUNCTION public.handle_entry_scoring_state_change',
      'DROP TRIGGER IF EXISTS entries_refresh_class_scoring_state'
    );

    expect(handler).toContain("IF v_class_status = 'completed' THEN");
    expect(handler).not.toContain("OR v_status_source = 'manual'");
  });
});
