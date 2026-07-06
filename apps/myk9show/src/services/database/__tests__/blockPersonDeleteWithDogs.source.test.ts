import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

// Source-level contract for the "can't delete a person who owns live dogs" guard.
// The invariant lives in a DB trigger so it holds across every delete path (the
// deleteUser service, admin-delete-user edge fn, or future cleanup tooling). A
// regression here silently re-opens the orphaned-dog hole.
const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

describe('block-person-delete-with-dogs migration', () => {
  const migration = read(
    '../../../../../../supabase/migrations/20260617130000_block_person_delete_with_dogs.sql'
  );

  it('defines the guard function as SECURITY DEFINER with a locked search_path', () => {
    expect(migration).toContain('FUNCTION public.prevent_orphaning_dogs_on_person_delete()');
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain("SET search_path = ''");
  });

  it('wires the guard to BOTH delete paths on people', () => {
    expect(migration).toMatch(/CREATE TRIGGER prevent_person_delete_with_dogs\s+BEFORE DELETE ON public\.people/);
    expect(migration).toMatch(
      /CREATE TRIGGER prevent_person_soft_delete_with_dogs\s+BEFORE UPDATE OF deleted_at ON public\.people/
    );
  });

  it('blocks only on PRIMARY ownership of LIVE dogs', () => {
    expect(migration).toContain('owner_id = OLD.id');
    expect(migration).toContain('deleted_at IS NULL');
    // Co-owned dogs must NOT trigger the block.
    expect(migration).not.toContain('co_owner_id');
  });

  it('only fires on the soft-delete transition (so restore is not blocked)', () => {
    expect(migration).toContain('OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL');
  });

  it('raises when live dogs remain', () => {
    expect(migration).toMatch(/IF v_dog_count > 0 THEN/);
    expect(migration).toContain('RAISE EXCEPTION');
  });
});
