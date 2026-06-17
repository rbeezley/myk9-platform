import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

// Source-level contract for person soft-delete. A direct .update({deleted_at}) is
// rejected by RLS (people_select's `deleted_at IS NULL` is enforced as a WITH CHECK
// on the new row), so soft-delete MUST go through the SECURITY DEFINER RPC. A
// regression to a direct update silently re-breaks person delete for everyone.
const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

describe('person soft-delete wiring', () => {
  it('deleteUser calls soft_delete_person RPC with p_person_id', () => {
    const src = read('../users/reads.ts');
    expect(src).toContain("supabase.rpc('soft_delete_person', { p_person_id: id })");
  });
});

describe('soft_delete_person migration', () => {
  const migration = read(
    '../../../../../../supabase/migrations/20260617140000_soft_delete_person_rpc.sql'
  );

  it('defines the function as SECURITY DEFINER with a locked search_path', () => {
    expect(migration).toContain('FUNCTION public.soft_delete_person(p_person_id uuid)');
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain("SET search_path = ''");
  });

  it('gates on site admin or show-person manager', () => {
    expect(migration).toContain('public.is_site_admin()');
    expect(migration).toContain('public.can_manage_show_person(p_person_id)');
  });

  it('only soft-deletes a currently-live row', () => {
    expect(migration).toContain('deleted_at IS NULL');
  });

  it('revokes from PUBLIC and grants execute to authenticated', () => {
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.soft_delete_person(uuid) FROM PUBLIC');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.soft_delete_person(uuid) TO authenticated');
  });
});
