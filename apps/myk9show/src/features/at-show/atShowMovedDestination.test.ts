import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';

const { getEntriesByShow, getClassById } = vi.hoisted(() => ({
  getEntriesByShow: vi.fn(),
  getClassById: vi.fn(),
}));

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: { getEntriesByShow },
  replicatedClassesTable: { getClassById },
}));

import { resolveMovedDestinationNames } from './atShowMovedDestination';
import { transformEntry } from './atShowDataAdapter';

const entry = (o: Record<string, unknown>) => ({ id: 'e', ...o }) as unknown as ReplicatedEntry;

describe('resolveMovedDestinationNames (MYK9-1940)', () => {
  beforeEach(() => {
    getEntriesByShow.mockReset();
    getClassById.mockReset();
  });

  it('names the class the moved dog went to, from replicated data', async () => {
    getEntriesByShow.mockResolvedValue([
      entry({ id: 'new', class_id: 'c2', moved_from_entry_id: 'old' }),
    ]);
    getClassById.mockResolvedValue({ element: 'Interior', level: 'Novice', section: 'B' });
    const names = await resolveMovedDestinationNames(
      [entry({ id: 'old', entry_status: 'moved' })],
      'show-1'
    );
    expect(getClassById).toHaveBeenCalledWith('c2');
    expect(names.get('old')).toContain('Novice');
  });

  it('reads nothing when no dog was moved', async () => {
    const names = await resolveMovedDestinationNames(
      [entry({ id: 'a', entry_status: 'confirmed' })],
      'show-1'
    );
    expect(names.size).toBe(0);
    expect(getEntriesByShow).not.toHaveBeenCalled();
  });

  it('leaves the dog out when no destination entry is found', async () => {
    getEntriesByShow.mockResolvedValue([]);
    const names = await resolveMovedDestinationNames(
      [entry({ id: 'old', entry_status: 'moved' })],
      'show-1'
    );
    expect(names.has('old')).toBe(false);
  });

  it('ignores a deleted destination entry', async () => {
    getEntriesByShow.mockResolvedValue([
      entry({ id: 'new', class_id: 'c2', moved_from_entry_id: 'old', deleted_at: 'x' }),
    ]);
    const names = await resolveMovedDestinationNames(
      [entry({ id: 'old', entry_status: 'moved' })],
      'show-1'
    );
    expect(names.size).toBe(0);
  });

  it('hands the name to the ringside entry', () => {
    const out = transformEntry(entry({ entry_status: 'moved' }), null, 'Novice B');
    expect(out.movedToClassName).toBe('Novice B');
    expect(transformEntry(entry({ entry_status: 'moved' }), null).movedToClassName).toBeUndefined();
  });
});
