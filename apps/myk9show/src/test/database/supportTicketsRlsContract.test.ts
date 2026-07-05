import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(__dirname, '../../../../../supabase/migrations/20260705013523_support_tickets.sql'),
  'utf8'
);

function sliceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('support tickets RLS contract', () => {
  it('keys ticket owners and message senders to auth.users ids', () => {
    expect(migration).toContain('owner_id uuid not null references auth.users(id)');
    expect(migration).toContain('sender_id uuid not null references auth.users(id)');
    expect(migration).toContain('owner_id = (select auth.uid())');
    expect(migration).toContain('sender_id = (select auth.uid())');
  });

  it('exposes the tables only to authenticated users with RLS enabled and anon revoked', () => {
    expect(migration).toContain('alter table public.support_tickets enable row level security');
    expect(migration).toContain(
      'alter table public.support_ticket_messages enable row level security'
    );
    expect(migration).toContain(
      'grant select, insert, update on public.support_tickets to authenticated'
    );
    expect(migration).toContain(
      'grant select, insert, update on public.support_ticket_messages to authenticated'
    );
    expect(migration).toContain('revoke all on public.support_tickets from anon');
    expect(migration).toContain('revoke all on public.support_ticket_messages from anon');
  });

  it('scopes ticket SELECT/INSERT/UPDATE to owner or site admin only', () => {
    const selectPolicy = sliceBetween(
      migration,
      'create policy "support_tickets_select_owner_or_site_admin"',
      'drop policy if exists "support_tickets_insert_owner_or_site_admin"'
    );
    const insertPolicy = sliceBetween(
      migration,
      'create policy "support_tickets_insert_owner_or_site_admin"',
      'drop policy if exists "support_tickets_update_owner_or_site_admin"'
    );
    const updatePolicy = sliceBetween(
      migration,
      'create policy "support_tickets_update_owner_or_site_admin"',
      'drop policy if exists "support_ticket_messages_select_owner_or_site_admin"'
    );

    for (const policy of [selectPolicy, insertPolicy, updatePolicy]) {
      expect(policy).toContain('to authenticated');
      expect(policy).toContain('owner_id = (select auth.uid())');
      expect(policy).toContain('(select public.is_site_admin())');
      expect(policy).not.toContain('using (true)');
    }
    expect(updatePolicy).toContain('with check');
  });

  it('scopes message reads/writes through ticket ownership or site admin access', () => {
    const insertPolicy = sliceBetween(
      migration,
      'create policy "support_ticket_messages_insert_owner_or_site_admin"',
      'drop policy if exists "support_ticket_messages_update_owner_or_site_admin"'
    );

    expect(insertPolicy).toContain('sender_id = (select auth.uid())');
    expect(insertPolicy).toContain('is_from_operator = (select public.is_site_admin())');
    expect(insertPolicy).toContain('from public.support_tickets t');
    expect(insertPolicy).toContain('t.owner_id = (select auth.uid())');
    expect(insertPolicy).toContain('(select public.is_site_admin())');
  });

  it('prevents non-admin users from mutating ticket identity or diagnostics after creation', () => {
    const fn = sliceBetween(
      migration,
      'create or replace function public.restrict_support_ticket_update_columns()',
      'revoke all on function public.restrict_support_ticket_update_columns() from public'
    );

    expect(fn).toContain('if not (select public.is_site_admin()) then');
    for (const column of [
      'owner_id',
      'subject',
      'diagnostics',
      'show_id',
      'is_show_day_priority',
      'created_at',
    ]) {
      expect(fn).toContain(`old.${column} is distinct from new.${column}`);
    }
  });

  it('limits support message updates to read_at only', () => {
    const fn = sliceBetween(
      migration,
      'create or replace function public.restrict_support_message_update_columns()',
      'revoke all on function public.restrict_support_message_update_columns() from public'
    );

    for (const column of ['ticket_id', 'sender_id', 'body', 'is_from_operator', 'created_at']) {
      expect(fn).toContain(`old.${column} is distinct from new.${column}`);
    }
    expect(fn).toContain('Only read_at may be updated on support_ticket_messages');
  });

  it('revokes trigger helper execution from public and reloads PostgREST schema', () => {
    expect(migration).toContain(
      'revoke all on function public.set_support_ticket_updated_at() from public'
    );
    expect(migration).toContain(
      'revoke all on function public.restrict_support_ticket_update_columns() from public'
    );
    expect(migration).toContain(
      'revoke all on function public.restrict_support_message_update_columns() from public'
    );
    expect(migration).toContain("notify pgrst, 'reload schema'");
  });
});
