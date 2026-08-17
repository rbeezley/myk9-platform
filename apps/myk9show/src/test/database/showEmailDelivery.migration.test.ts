import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');
const migration = readFileSync(
  resolve(repoRoot, 'supabase/migrations/20260817120000_show_email_delivery_history.sql'),
  'utf8'
);

describe('MYK9-180 email delivery history migration contract', () => {
  it('adds a nullable canonical scope and a supporting descending cursor index', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS show_id uuid');
    expect(migration).toContain('ALTER COLUMN recipient_email DROP NOT NULL');
    expect(migration).toContain('email_log (show_id, created_at DESC, id DESC)');
  });

  it('backfills only deterministic show-owned sources and preserves orphan invisibility', () => {
    expect(migration).toContain(
      "log.email_type IN ('registration_confirmation', 'entry_decision')"
    );
    expect(migration).toContain("log.email_type = 'show_lifecycle_email'");
    expect(migration).toContain("log.email_type = 'waitlist_notification'");
    expect(migration).toContain("'heritage_confirmation'");
    expect(migration).toContain('NOT EXISTS');
    expect(migration).toContain('source_kind IS NOT NULL');
  });

  it('bounds and authorizes the RPC while rejecting malformed cursors', () => {
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toContain('p_limit < 1 OR p_limit > 100');
    expect(migration).toContain('(p_before_created_at IS NULL) <> (p_before_id IS NULL)');
    expect(migration).toContain(
      '(history.created_at, history.id) < (p_before_created_at, p_before_id)'
    );
    expect(migration).toContain('ORDER BY history.created_at DESC, history.id DESC');
    expect(migration).toContain('public.can_manage_show_lifecycle_email(p_show_id)');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.get_show_email_delivery_history');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.get_show_email_delivery_history');
    expect(migration).toContain('TO authenticated');
    expect(migration).toContain('FROM PUBLIC, anon');
  });

  it('normalizes unknown provider statuses to unavailable and never exposes raw errors', () => {
    expect(migration).toContain("ELSE 'unavailable'");
    expect(migration).toContain("'The email could not be sent.'");
    expect(migration).not.toContain('log.error_message AS failure_summary');
  });
});
