/**
 * MYK9-519 — the Dog Details -> show entry handoff contract.
 *
 * These pin the context rules the wizard depends on: the param survives a
 * round trip through the URL, a resumed draft beats it, and a dog the
 * exhibitor cannot enter is NEVER swapped for a different one.
 */

import { describe, it, expect } from 'vitest';
import type { Dog } from '@/types/dog-types';
import {
  ENTRY_DOG_PARAM,
  entryDogHandoffMessage,
  readEntryDogId,
  resolveEntryDogHandoff,
  withEntryDogContext,
} from './entryDogContext';

function makeDog(overrides: Partial<Dog> = {}): Dog {
  return {
    id: 'dog-1',
    name: 'Maple Of The Glen',
    callName: 'Maple',
    breed: 'Border Collie',
    sex: 'female',
    ownerId: 'owner-1',
    ...overrides,
  } as Dog;
}

const alwaysEligible = () => ({ eligible: true, issues: [] as string[] });

describe('readEntryDogId', () => {
  it('reads the param and trims it', () => {
    expect(readEntryDogId(`?${ENTRY_DOG_PARAM}=%20dog-1%20`)).toBe('dog-1');
  });

  it('returns null when absent, empty, or absurdly long', () => {
    expect(readEntryDogId('?tab=classes')).toBeNull();
    expect(readEntryDogId(`?${ENTRY_DOG_PARAM}=`)).toBeNull();
    expect(readEntryDogId(`?${ENTRY_DOG_PARAM}=${'x'.repeat(65)}`)).toBeNull();
  });
});

describe('withEntryDogContext', () => {
  it('is a no-op without a dog', () => {
    expect(withEntryDogContext('/shows', null)).toBe('/shows');
    expect(withEntryDogContext('/shows', undefined)).toBe('/shows');
  });

  it('appends to a bare path and survives a read back (refresh / copied link)', () => {
    const href = withEntryDogContext('/shows', 'dog-1');
    expect(href).toBe('/shows?dogId=dog-1');
    expect(readEntryDogId(new URL(href, 'https://example.test').search)).toBe('dog-1');
  });

  it('preserves an existing query and hash instead of clobbering them', () => {
    expect(withEntryDogContext('/shows/s1?tab=classes#ring', 'dog-1')).toBe(
      '/shows/s1?tab=classes&dogId=dog-1#ring'
    );
  });

  it('replaces rather than duplicates the param across hops', () => {
    expect(withEntryDogContext('/shows?dogId=old', 'dog-1')).toBe('/shows?dogId=dog-1');
  });

  it('encodes an id that would otherwise break the query string', () => {
    expect(withEntryDogContext('/shows', 'a b&c')).toBe('/shows?dogId=a+b%26c');
  });
});

describe('resolveEntryDogHandoff', () => {
  const dogs = [makeDog(), makeDog({ id: 'dog-2', callName: 'Scout' })];

  it('does nothing without a dog id', () => {
    expect(
      resolveEntryDogHandoff({
        dogId: null,
        accessibleDogs: dogs,
        selectedDogs: [],
        eligibility: alwaysEligible,
      })
    ).toEqual({ status: 'none' });
  });

  it('preselects exactly the carried dog', () => {
    expect(
      resolveEntryDogHandoff({
        dogId: 'dog-2',
        accessibleDogs: dogs,
        selectedDogs: [],
        eligibility: alwaysEligible,
      })
    ).toEqual({ status: 'applied', dogIds: ['dog-2'] });
  });

  it('lets a resumed draft win and drops the param', () => {
    expect(
      resolveEntryDogHandoff({
        dogId: 'dog-2',
        accessibleDogs: dogs,
        selectedDogs: ['dog-1'],
        eligibility: alwaysEligible,
      })
    ).toEqual({ status: 'draft-wins' });
  });

  it('reports a dog that is missing, deleted, or not theirs — and selects nothing', () => {
    const handoff = resolveEntryDogHandoff({
      dogId: 'someone-elses-dog',
      accessibleDogs: dogs,
      selectedDogs: [],
      eligibility: alwaysEligible,
    });
    expect(handoff).toEqual({ status: 'not-found' });
    expect(entryDogHandoffMessage(handoff)).toMatch(/couldn't find that dog/i);
  });

  it('reports an ineligible dog by name with the step’s own reasons', () => {
    const handoff = resolveEntryDogHandoff({
      dogId: 'dog-1',
      accessibleDogs: dogs,
      selectedDogs: [],
      eligibility: () => ({ eligible: false, issues: ['Too young (must be 6+ months)'] }),
    });
    expect(handoff).toEqual({
      status: 'ineligible',
      dogName: 'Maple',
      issues: ['Too young (must be 6+ months)'],
    });
    expect(entryDogHandoffMessage(handoff)).toContain('Too young (must be 6+ months)');
  });

  it('stays silent for the cases that are not failures', () => {
    expect(entryDogHandoffMessage({ status: 'none' })).toBeNull();
    expect(entryDogHandoffMessage({ status: 'draft-wins' })).toBeNull();
    expect(entryDogHandoffMessage({ status: 'applied', dogIds: ['dog-1'] })).toBeNull();
  });
});
