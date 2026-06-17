import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

// Regression guard: deleting a club from the detail page must go through the
// real soft-delete service mutation (useDeleteClubMutation → deleteClub → DB),
// NOT clubStore.removeClub, which only cleared the local cache / queued a
// replication DELETE that never reached the DB — so "deleted" clubs resurrected
// on sync and never appeared in the restore UI.
const source = readFileSync(resolve(__dirname, './useClubDetailsState.ts'), 'utf8');

describe('club detail delete wiring', () => {
  it('imports the real delete mutation', () => {
    expect(source).toContain('useDeleteClubMutation');
  });

  it('confirm-delete calls the mutation (DB soft-delete), not the local-cache remove', () => {
    expect(source).toContain('deleteClubMutation.mutateAsync(selectedClub.id)');
  });

  it('no longer calls clubStore.removeClub for deletion', () => {
    expect(source).not.toContain('await removeClub(');
    expect(source).not.toMatch(/removeClub\s*}\s*=\s*useClubStore/);
  });
});
