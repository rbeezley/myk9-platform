import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

// Source-level contract for the Deleted Entities (restore) UI writes.
// Regression guarded: dogs/shows/classes/people *_select RLS hides tombstones,
// so a direct `UPDATE ... WHERE id = X RETURNING ...` matches 0 rows (the SELECT
// policy gates the UPDATE's row-location step). Restore MUST go through the
// admin-gated SECURITY DEFINER restore_* RPCs. A regression to a direct .update()
// (or a typo'd RPC/param name) silently makes restore fail with a generic toast.
const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

describe('restore write wiring', () => {
  it('restoreDog calls restore_dog RPC with p_dog_id', () => {
    const src = read('../dogs/reads.ts');
    expect(src).toContain("supabase.rpc('restore_dog', { p_dog_id: id })");
  });

  it('restoreShow calls restore_show RPC with p_show_id', () => {
    const src = read('../shows/writes.ts');
    expect(src).toContain("supabase.rpc('restore_show', { p_show_id: id })");
  });

  it('restoreClass calls restore_class RPC with p_class_id', () => {
    const src = read('../classes/reads.ts');
    expect(src).toContain("supabase.rpc('restore_class', { p_class_id: id })");
  });

  it('restoreUser calls restore_person RPC with p_person_id', () => {
    const src = read('../users/reads.ts');
    expect(src).toContain("supabase.rpc('restore_person', { p_person_id: id })");
  });
});

describe('restore write RPC migration', () => {
  const migration = read(
    '../../../../../../supabase/migrations/20260617120000_restore_entity_rpcs.sql'
  );

  it('defines all four admin restore functions', () => {
    for (const fn of ['restore_dog', 'restore_show', 'restore_class', 'restore_person']) {
      expect(migration).toContain(`FUNCTION public.${fn}(p_`);
    }
  });

  it('runs every function as SECURITY DEFINER with a locked search_path', () => {
    expect((migration.match(/SECURITY DEFINER/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((migration.match(/SET search_path = ''/g) ?? []).length).toBe(4);
  });

  it('gates every function on is_platform_admin()', () => {
    const gateCount = (migration.match(/is_platform_admin\(\)/g) ?? []).length;
    expect(gateCount).toBeGreaterThanOrEqual(4);
  });

  it('revokes from PUBLIC and grants execute to authenticated for all four', () => {
    expect((migration.match(/REVOKE ALL ON FUNCTION/g) ?? []).length).toBe(4);
    expect((migration.match(/GRANT EXECUTE ON FUNCTION/g) ?? []).length).toBe(4);
  });

  it('cascade-restores children by matching the parent deleted_at timestamp', () => {
    // dog -> entries, class -> entries, show -> trials/classes/entries.
    expect((migration.match(/deleted_at = v_deleted_at/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it('restore_person does not cascade (person delete has no cascade)', () => {
    // Isolate the restore_person body and assert it touches only public.people.
    const body = migration.slice(
      migration.indexOf('FUNCTION public.restore_person'),
      migration.indexOf('-- Restrict to authenticated')
    );
    expect(body).toContain('UPDATE public.people');
    expect(body).not.toContain('UPDATE public.entries');
  });
});
