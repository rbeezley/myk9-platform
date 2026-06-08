import { describe, expect, it } from 'vitest';
import { whoIsEditing } from '@/features/show-presence/presenceSelectors';
import type { ShowPresence } from '@/features/show-presence/types';

/** Minimal present-user factory; override only what the case cares about. */
const mk = (over: Partial<ShowPresence>): ShowPresence => ({
  userId: 'u',
  name: 'Someone',
  role: 'secretary',
  location: { page: '' },
  activity: 'editing',
  ts: 1,
  ...over,
});

const editing = (entityId: string) => ({ entityType: 'entry', entityId });

describe('whoIsEditing', () => {
  it('returns another present user editing the same entity', () => {
    const present = [
      mk({ userId: 'me', name: 'Me' }),
      mk({ userId: 'her', name: 'Jane', editing: editing('e1') }),
    ];
    expect(whoIsEditing(present, 'me', 'entry', 'e1')?.name).toBe('Jane');
  });

  it('excludes self even when self is editing the same entity', () => {
    const present = [mk({ userId: 'me', name: 'Me', editing: editing('e1') })];
    expect(whoIsEditing(present, 'me', 'entry', 'e1')).toBeUndefined();
  });

  it('returns undefined when nobody is editing', () => {
    const present = [mk({ userId: 'her', name: 'Jane' })];
    expect(whoIsEditing(present, 'me', 'entry', 'e1')).toBeUndefined();
  });

  it('ignores a user editing a different entity id', () => {
    const present = [mk({ userId: 'her', name: 'Jane', editing: editing('OTHER') })];
    expect(whoIsEditing(present, 'me', 'entry', 'e1')).toBeUndefined();
  });

  it('ignores a user editing a different entity type', () => {
    const present = [
      mk({ userId: 'her', name: 'Jane', editing: { entityType: 'show', entityId: 'e1' } }),
    ];
    expect(whoIsEditing(present, 'me', 'entry', 'e1')).toBeUndefined();
  });

  it('returns the first other matching editor when several are present', () => {
    const present = [
      mk({ userId: 'a', name: 'Amy', editing: editing('e1') }),
      mk({ userId: 'b', name: 'Bob', editing: editing('e1') }),
    ];
    expect(whoIsEditing(present, 'me', 'entry', 'e1')?.name).toBe('Amy');
  });
});
