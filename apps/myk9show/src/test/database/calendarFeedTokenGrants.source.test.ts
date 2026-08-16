import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source contract for the webcal token table (plan L5, migration 20260816130000).
 *
 * A webcal feed URL is fetched by Google/Apple servers with no session, so the
 * URL IS the credential. The first draft of this migration granted
 * authenticated full CRUD behind an owner-scoped `for all` policy, which an
 * audit caught: a WITH CHECK on user_id constrains who owns the row, not what
 * is in it. That let a client write its own low-entropy token, probe the
 * table-wide UNIQUE on `token` as an existence oracle for other users' tokens,
 * clear `revoked_at` to undo a revocation, or repoint `show_id` at a shared
 * URL.
 *
 * The rule this pins: clients may READ their own token row and nothing else.
 * Every write goes through the SECURITY DEFINER RPCs.
 */
const source = readFileSync(
  resolve(__dirname, '../../../../../supabase/migrations/20260816130000_calendar_feed_tokens.sql'),
  'utf8'
);

/**
 * Statements only. The migration's own comments explain the INSERT/UPDATE
 * holes in prose, so a naive regex over the raw file matches the explanation
 * and reports a violation that does not exist.
 */
const statements = source
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n');

describe('calendar_feed_tokens grants', () => {
  it('grants authenticated SELECT only — never INSERT, UPDATE or DELETE', () => {
    expect(source).toContain('grant select on public.calendar_feed_tokens to authenticated;');
    expect(statements).not.toMatch(
      /grant[^;]*\b(insert|update|delete)\b[^;]*on public\.calendar_feed_tokens to authenticated/i
    );
  });

  it('never exposes the table to anon', () => {
    expect(source).toContain('revoke all on public.calendar_feed_tokens from anon;');
    expect(statements).not.toMatch(/grant[^;]*on public\.calendar_feed_tokens to anon/i);
  });

  it('keeps the client policy read-only', () => {
    expect(statements).toMatch(/create policy calendar_feed_tokens_owner_read[\s\S]*?for select/);
    expect(statements).not.toMatch(/create policy[^;]*on public\.calendar_feed_tokens[\s\S]{0,200}for all/);
  });

  it('wraps auth.uid() for the RLS initplan', () => {
    expect(source).toContain('(select auth.uid()) = user_id');
  });

  it('enables and forces row level security', () => {
    expect(source).toContain('alter table public.calendar_feed_tokens enable row level security;');
    expect(source).toContain('alter table public.calendar_feed_tokens force row level security;');
  });

  it('generates tokens server-side with 32 bytes of entropy', () => {
    expect(source).toContain("encode(extensions.gen_random_bytes(32), 'hex')");
  });

  it('hardens both RPCs with an empty search_path and explicit EXECUTE decisions', () => {
    for (const fn of ['issue_calendar_feed_token', 'revoke_calendar_feed_token']) {
      expect(source).toContain(`revoke execute on function public.${fn}(uuid) from public, anon;`);
      expect(source).toContain(`grant execute on function public.${fn}(uuid) to authenticated;`);
    }
    expect(statements.match(/set search_path = ''/g)?.length).toBe(2);
  });

  it('clears revoked_at on rotation so a reissued URL is live again', () => {
    expect(source).toContain('revoked_at = null');
  });
});
