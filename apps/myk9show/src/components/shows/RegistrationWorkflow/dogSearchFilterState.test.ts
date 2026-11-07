import { describe, it, expect } from 'vitest';
import type { Dog } from '@/types/dog-types';
import {
  EMPTY_DOG_FILTERS,
  applyDogFilters,
  buildDogFilterValues,
  countAppliedDogFilters,
} from './dogSearchFilterState';

const NOW = new Date('2026-11-07T12:00:00Z');

const dog = (id: string, overrides: Partial<Dog> = {}): Dog =>
  ({
    id,
    name: id,
    callName: id,
    breed: 'Labrador Retriever',
    gender: 'Female',
    ownerId: 'o1',
    registrations: [],
    ...overrides,
  }) as Dog;

const akc = (registrationDate?: string) =>
  ({
    organization: 'AKC (American Kennel Club)',
    registrationNumber: 'SR1',
    ...(registrationDate ? { registrationDate } : {}),
  }) as NonNullable<Dog['registrations']>[number];

const DOGS = [
  dog('reg-old', { registrations: [akc('2020-01-01')] }),
  dog('reg-new', { registrations: [akc('2026-11-01')], gender: 'Male' }),
  dog('none', { breed: 'Border Collie' }),
];

const ids = (dogs: Dog[]) => dogs.map(d => d.id);

describe('dog step filters (MYK9-1742)', () => {
  it('shows every dog with nothing ticked', () => {
    expect(ids(applyDogFilters(DOGS, EMPTY_DOG_FILTERS, NOW))).toEqual([
      'reg-old',
      'reg-new',
      'none',
    ]);
  });

  it('widens within a group: Has a registration + No registration yet is everyone', () => {
    const selection = { ...EMPTY_DOG_FILTERS, registration: ['registered', 'unregistered'] };
    expect(applyDogFilters(DOGS, selection, NOW)).toHaveLength(3);
  });

  it('reads "recent" as a registration dated in the last 30 days', () => {
    const selection = { ...EMPTY_DOG_FILTERS, registration: ['recent'] };
    expect(ids(applyDogFilters(DOGS, selection, NOW))).toEqual(['reg-new']);
  });

  it('narrows across groups', () => {
    const selection = { ...EMPTY_DOG_FILTERS, registry: ['AKC'], sex: ['Female'] };
    expect(ids(applyDogFilters(DOGS, selection, NOW))).toEqual(['reg-old']);
  });

  it('buckets age by months and never matches a dog with no date of birth', () => {
    const born = (months: number) =>
      new Date(NOW.getTime() - months * 30 * 24 * 60 * 60 * 1000).toISOString();
    const dogs = [
      dog('pup', { dateOfBirth: born(17) }),
      dog('young', { dateOfBirth: born(18) }),
      dog('adult', { dateOfBirth: born(60) }),
      dog('senior', { dateOfBirth: born(84) }),
      dog('unknown'),
    ];
    const pick = (age: string) =>
      ids(applyDogFilters(dogs, { ...EMPTY_DOG_FILTERS, age: [age] }, NOW));
    expect(pick('puppy')).toEqual(['pup']);
    expect(pick('young')).toEqual(['young']);
    expect(pick('adult')).toEqual(['adult']);
    expect(pick('senior')).toEqual(['senior']);
  });

  it('filters by breed label (read from the registration) and sex', () => {
    const collie = dog('collie', {
      registrations: [
        { ...akc(), breed: 'Border Collie' } as NonNullable<Dog['registrations']>[number],
      ],
    });
    expect(
      ids(
        applyDogFilters([...DOGS, collie], { ...EMPTY_DOG_FILTERS, breed: ['Border Collie'] }, NOW)
      )
    ).toEqual(['collie']);
    expect(buildDogFilterValues([...DOGS, collie]).breeds).toEqual(['Border Collie']);
    expect(ids(applyDogFilters(DOGS, { ...EMPTY_DOG_FILTERS, sex: ['Male'] }, NOW))).toEqual([
      'reg-new',
    ]);
  });

  it('counts ticked values and lists registries by short name', () => {
    expect(
      countAppliedDogFilters({ ...EMPTY_DOG_FILTERS, breed: ['a', 'b'], age: ['puppy'] })
    ).toBe(3);
    expect(buildDogFilterValues(DOGS).registries).toEqual(['AKC']);
  });
});
