import { describe, it, expect } from 'vitest';
import { selectOwnedDogs, selectOwnedDogIds } from './dogOwnership';

const make = (id: string, ownerId?: string | null) => ({ id, ownerId });

describe('selectOwnedDogs', () => {
  it('returns only dogs matching the given ownerId', () => {
    const dogs = [make('a', 'user1'), make('b', 'user2'), make('c', 'user1')];
    expect(selectOwnedDogs(dogs, 'user1')).toEqual([make('a', 'user1'), make('c', 'user1')]);
  });

  it('preserves input order', () => {
    const dogs = [make('z', 'u'), make('a', 'u'), make('m', 'u')];
    expect(selectOwnedDogs(dogs, 'u').map(d => d.id)).toEqual(['z', 'a', 'm']);
  });

  it('returns empty array when ownerId is null', () => {
    const dogs = [make('a', 'user1')];
    expect(selectOwnedDogs(dogs, null)).toEqual([]);
  });

  it('returns empty array when ownerId is undefined', () => {
    const dogs = [make('a', 'user1')];
    expect(selectOwnedDogs(dogs, undefined)).toEqual([]);
  });

  it('returns empty array when ownerId is empty string', () => {
    const dogs = [make('a', 'user1')];
    expect(selectOwnedDogs(dogs, '')).toEqual([]);
  });

  it('returns empty array when dogs array is empty', () => {
    expect(selectOwnedDogs([], 'user1')).toEqual([]);
  });

  it('does not match dogs whose ownerId is undefined', () => {
    const dogs = [make('a', undefined), make('b', null)];
    expect(selectOwnedDogs(dogs, 'user1')).toEqual([]);
  });

  it('preserves extra properties on matched dogs (generic T)', () => {
    const dogs = [{ id: 'a', ownerId: 'u', name: 'Rex' }];
    const result = selectOwnedDogs(dogs, 'u');
    expect(result).toEqual([{ id: 'a', ownerId: 'u', name: 'Rex' }]);
  });
});

describe('selectOwnedDogIds', () => {
  it('returns a Set of ids for the matching owner', () => {
    const dogs = [make('a', 'user1'), make('b', 'user2'), make('c', 'user1')];
    const ids = selectOwnedDogIds(dogs, 'user1');
    expect(ids).toBeInstanceOf(Set);
    expect(ids).toEqual(new Set(['a', 'c']));
  });

  it('returns empty Set when ownerId is null', () => {
    expect(selectOwnedDogIds([make('a', 'user1')], null)).toEqual(new Set());
  });

  it('returns empty Set when ownerId is undefined', () => {
    expect(selectOwnedDogIds([make('a', 'user1')], undefined)).toEqual(new Set());
  });

  it('returns empty Set when ownerId is empty string', () => {
    expect(selectOwnedDogIds([make('a', 'user1')], '')).toEqual(new Set());
  });

  it('returns empty Set when dogs array is empty', () => {
    expect(selectOwnedDogIds([], 'user1')).toEqual(new Set());
  });

  it('does not include dogs with undefined ownerId when querying a real id', () => {
    const dogs = [make('a', undefined), make('b', 'user1')];
    expect(selectOwnedDogIds(dogs, 'user1')).toEqual(new Set(['b']));
  });
});
