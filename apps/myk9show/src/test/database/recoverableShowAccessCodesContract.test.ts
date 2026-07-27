import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260727160000_recoverable_show_access_codes.sql'
  ),
  'utf8'
);

function sliceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('recoverable show access codes — migration contract', () => {
  it('adds encrypted storage with domain-separated locked helpers', () => {
    expect(migration).toMatch(/add column if not exists passcode_ciphertext\s+bytea/i);
    expect(migration).toContain('show-access-code-encryption:v1');
    expect(migration).toContain('extensions.pgp_sym_encrypt');
    expect(migration).toContain('extensions.pgp_sym_decrypt');
    expect(migration).toMatch(
      /revoke all on function public\._encrypt_show_passcode\(text\)\s+from public, anon, authenticated/i
    );
    expect(migration).toMatch(
      /revoke all on function public\._decrypt_show_passcode\(bytea\)\s+from public, anon, authenticated/i
    );
  });

  it('writes ciphertext atomically during insert and regeneration', () => {
    const insertFn = sliceBetween(
      migration,
      'create or replace function public.insert_show_passcodes',
      'revoke all on function public.insert_show_passcodes'
    );
    const regenerateFn = sliceBetween(
      migration,
      'create or replace function public.regenerate_show_passcodes',
      'revoke all on function public.regenerate_show_passcodes'
    );

    for (const fn of [insertFn, regenerateFn]) {
      expect(fn).toContain('passcode_ciphertext');
      expect(fn).toContain('public._encrypt_show_passcode');
      expect(fn).toContain('v_admin.plaintext');
      expect(fn).toContain('v_judge.plaintext');
      expect(fn).toContain('v_steward.plaintext');
      expect(fn).toContain('v_exhibitor.plaintext');
    }

    expect(regenerateFn).toContain('passcode_hash = excluded.passcode_hash');
    expect(regenerateFn).toContain('passcode_ciphertext = excluded.passcode_ciphertext');
    expect(regenerateFn).toContain('created_at = now()');
  });

  it('derives the visible role union entirely on the server', () => {
    const getter = sliceBetween(
      migration,
      'create or replace function public.get_show_access_codes',
      'revoke all on function public.get_show_access_codes'
    );

    expect(getter).toContain('public._can_manage_show_passcodes(p_show_id)');
    expect(getter).toContain('s.deleted_at is null');
    expect(getter).toContain('public.judge_assignments');
    expect(getter).toContain("ja.status in ('confirmed', 'invited')");
    expect(getter).toContain('p.deleted_at is null');
    expect(getter).toContain("r.name = 'steward'");
    expect(getter).toContain('ur.is_active = true');
    expect(getter).toContain('ur.expires_at is null or ur.expires_at > now()');
    expect(getter).toContain("array_append(v_allowed_roles, 'judge')");
    expect(getter).toContain("array_append(v_allowed_roles, 'steward')");
    expect(getter).toContain("array_append(v_allowed_roles, 'exhibitor')");
    expect(getter).toContain(
      "v_allowed_roles := array['admin', 'judge', 'steward', 'exhibitor']"
    );
  });

  it('matches the active submitted-entry projection and fails closed for inactive rows', () => {
    const getter = sliceBetween(
      migration,
      'create or replace function public.get_show_access_codes',
      'revoke all on function public.get_show_access_codes'
    );

    for (const activeStatus of [
      'no-status',
      'draft',
      'submitted',
      'pending',
      'paid',
      'confirmed',
      'accepted',
      'scheduled',
      'pending-payment',
      'waitlisted',
      'checked-in',
      'at-gate',
      'in-ring',
      'competing',
      'scratch-requested',
      'scratch_requested',
      'move-up-requested',
      'move_up_requested',
    ]) {
      expect(getter).toContain(`'${activeStatus}'`);
    }

    expect(getter).toContain('e.deleted_at is null');
    expect(getter).toContain("coalesce(e.check_in_status, '') <> 'pulled'");
    expect(getter).toContain('e.handler_id = p.id');
    expect(getter).toContain('d.owner_id = p.id');
    expect(getter).toContain('d.co_owner_id = p.id');
  });

  it('authorizes before decrypting and exposes only an authenticated RPC', () => {
    const getter = sliceBetween(
      migration,
      'create or replace function public.get_show_access_codes',
      'revoke all on function public.get_show_access_codes'
    );

    expect(getter.indexOf('v_allowed_roles')).toBeLessThan(
      getter.indexOf('public._decrypt_show_passcode')
    );
    expect(migration).toContain(
      'revoke all on function public.get_show_access_codes(uuid) from public, anon'
    );
    expect(migration).toContain(
      'grant execute on function public.get_show_access_codes(uuid) to authenticated'
    );
    expect(migration).not.toContain('grant select on public.show_passcodes');
  });
});
