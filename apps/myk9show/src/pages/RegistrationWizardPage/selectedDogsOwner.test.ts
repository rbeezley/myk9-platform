import { describe, it, expect } from 'vitest';
import type { Dog } from '@/types/dog-types';
import { selectedDogsOwner } from './selectedDogsOwner';

const makeDog = (id: string, ownerId: string | null): Dog =>
  ({
    id,
    ownerId: ownerId ?? undefined,
    name: id,
    callName: id,
  }) as unknown as Dog;

describe('selectedDogsOwner', () => {
  it('returns ok=false with empty owners when no dogs are selected', () => {
    const result = selectedDogsOwner([makeDog('d1', 'o1')], []);
    expect(result).toEqual({ ok: false, owners: [] });
  });

  it('returns ok=true with the owner id for a single owner / single dog', () => {
    const dogs = [makeDog('d1', 'o1')];
    expect(selectedDogsOwner(dogs, ['d1'])).toEqual({ ok: true, ownerId: 'o1' });
  });

  it('returns ok=true with the owner id when all selected dogs share an owner', () => {
    const dogs = [makeDog('d1', 'o1'), makeDog('d2', 'o1'), makeDog('d3', 'o1')];
    expect(selectedDogsOwner(dogs, ['d1', 'd2', 'd3'])).toEqual({
      ok: true,
      ownerId: 'o1',
    });
  });

  it('returns ok=false with the unique owners when selection spans multiple owners', () => {
    const dogs = [makeDog('d1', 'o1'), makeDog('d2', 'o2')];
    const result = selectedDogsOwner(dogs, ['d1', 'd2']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.owners.sort()).toEqual(['o1', 'o2']);
    }
  });

  it('treats a dog with no ownerId as a multi-owner failure (cannot enroll under no one)', () => {
    const dogs = [makeDog('d1', 'o1'), makeDog('d2', null)];
    const result = selectedDogsOwner(dogs, ['d1', 'd2']);
    expect(result.ok).toBe(false);
  });

  it('ignores selected ids that do not match any dog in the list', () => {
    const dogs = [makeDog('d1', 'o1')];
    expect(selectedDogsOwner(dogs, ['d1', 'd-missing'])).toEqual({
      ok: true,
      ownerId: 'o1',
    });
  });
});
