import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(__dirname, '../../../../../supabase/migrations/20260622002405_waitlist_join_channel.sql'),
  'utf8'
);

const waitlistReads = readFileSync(
  resolve(__dirname, '../../services/database/waitlists/reads.ts'),
  'utf8'
);

describe('waitlist joined_via channel contract', () => {
  it('adds a constrained channel column for online vs mail-in waitlist rows', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS joined_via');
    expect(migration).toContain("CHECK (joined_via IN ('online', 'mail_in'))");
  });

  it('marks exhibitor-facing waitlist joins as online', () => {
    expect(waitlistReads).toContain("joined_via: 'online'");
    expect(migration).toContain('joined_via');
    expect(migration).toContain("'online'");
  });

  it('limits mail-in waitlist rows to trusted show managers through the RPC', () => {
    expect(migration).toContain('DROP FUNCTION IF EXISTS public.add_to_waitlist(uuid, uuid, uuid, uuid)');
    expect(migration).toContain("p_joined_via text DEFAULT 'online'");
    expect(migration).toContain("p_joined_via NOT IN ('online', 'mail_in')");
    expect(migration).toContain("p_joined_via = 'mail_in'");
    expect(migration).toContain('public.is_show_secretary(v_show_id)');
    expect(migration).toContain('public.is_site_admin()');
    expect(migration).toContain('Only show secretaries may create mail-in waitlist rows');
    expect(migration).toContain('p_joined_via');
    expect(migration).toContain('add_to_waitlist(uuid, uuid, uuid, uuid, text)');
    expect(migration).toContain('Caller cannot waitlist this dog');
    expect(migration).toContain('d.owner_id = public.get_my_person_id()');
    expect(migration).toContain('d.co_owner_id = public.get_my_person_id()');
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.add_to_waitlist(uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated'
    );
  });

  it('requires exhibitor-owned dogs for direct waitlist inserts', () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "waitlist_entries_insert"');
    expect(migration).toContain('CREATE POLICY "waitlist_entries_insert"');
    expect(migration).toContain('exhibitor_profiles ep');
    expect(migration).toContain('ep.auth_user_id = (SELECT auth.uid())');
    expect(migration).toContain('FROM public.dogs d');
    expect(migration).toContain('d.owner_id = (SELECT public.get_my_person_id())');
    expect(migration).toContain('d.co_owner_id = (SELECT public.get_my_person_id())');
  });
});
