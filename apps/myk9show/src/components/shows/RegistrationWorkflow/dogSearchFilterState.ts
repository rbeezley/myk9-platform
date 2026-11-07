/**
 * The Add Entry dog step's filters (MYK9-1742): what the one Filter menu offers and how a
 * selection narrows the dogs. Ticked values in one group widen it (any of them), groups narrow
 * each other (all of them), and an empty group means everything, like every Filter menu.
 */

import { normalizeOrganization } from '@/features/dogs/identity';
import { getDogBreedLabel, type Dog } from '@/types/dog-types';

export interface DogFilterSelection {
  /** Registration state: `registered`, `unregistered`, `recent`. */
  registration: string[];
  breed: string[];
  sex: string[];
  registry: string[];
  age: string[];
}

export type DogFilterGroup = keyof DogFilterSelection;

export const EMPTY_DOG_FILTERS: DogFilterSelection = {
  registration: [],
  breed: [],
  sex: [],
  registry: [],
  age: [],
};

export const REGISTRATION_OPTIONS = [
  { value: 'registered', label: 'Has a registration' },
  { value: 'unregistered', label: 'No registration yet' },
  { value: 'recent', label: 'Registered in the last 30 days' },
] as const;

export const AGE_OPTIONS = [
  { value: 'puppy', label: 'Puppy (under 18 months)' },
  { value: 'young', label: 'Young adult (18 months to 5 years)' },
  { value: 'adult', label: 'Adult (5 to 7 years)' },
  { value: 'senior', label: 'Senior (7 years and up)' },
] as const;

const DAY_MS = 1000 * 60 * 60 * 24;

function matchesRegistration(dog: Dog, value: string, now: Date): boolean {
  const registrations = dog.registrations ?? [];
  switch (value) {
    case 'registered':
      return registrations.length > 0;
    case 'unregistered':
      return registrations.length === 0;
    case 'recent': {
      const since = now.getTime() - 30 * DAY_MS;
      return registrations.some(
        reg => !!reg.registrationDate && new Date(reg.registrationDate).getTime() > since
      );
    }
    default:
      return true;
  }
}

function matchesAge(dog: Dog, value: string, now: Date): boolean {
  if (!dog.dateOfBirth) return false;
  const months = (now.getTime() - new Date(dog.dateOfBirth).getTime()) / (DAY_MS * 30);
  switch (value) {
    case 'puppy':
      return months < 18;
    case 'young':
      return months >= 18 && months < 60;
    case 'adult':
      return months >= 60 && months < 84;
    case 'senior':
      return months >= 84;
    default:
      return true;
  }
}

/** Whether one dog passes one group's ticked values. */
export function dogMatchesGroup(
  dog: Dog,
  group: DogFilterGroup,
  values: string[],
  now: Date
): boolean {
  if (values.length === 0) return true;
  switch (group) {
    case 'registration':
      return values.some(value => matchesRegistration(dog, value, now));
    case 'breed':
      return values.includes(getDogBreedLabel(dog));
    case 'sex':
      return !!dog.gender && values.includes(dog.gender);
    case 'registry':
      return (dog.registrations ?? []).some(reg =>
        values.includes(normalizeOrganization(reg.organization) ?? '')
      );
    case 'age':
      return values.some(value => matchesAge(dog, value, now));
  }
}

const GROUPS: DogFilterGroup[] = ['registration', 'breed', 'sex', 'registry', 'age'];

export function applyDogFilters(
  dogs: Dog[],
  selection: DogFilterSelection,
  now: Date = new Date()
): Dog[] {
  return dogs.filter(dog =>
    GROUPS.every(group => dogMatchesGroup(dog, group, selection[group], now))
  );
}

export function countAppliedDogFilters(selection: DogFilterSelection): number {
  return GROUPS.reduce((total, group) => total + selection[group].length, 0);
}

/** The values each group can offer, read from the dogs on hand. */
export function buildDogFilterValues(dogs: Dog[]): {
  breeds: string[];
  sexes: string[];
  registries: string[];
} {
  const unique = (values: Array<string | undefined | null>) =>
    [...new Set(values.filter((value): value is string => !!value))].sort();
  return {
    breeds: unique(dogs.map(dog => getDogBreedLabel(dog))).filter(
      breed => breed !== 'Breed not set'
    ),
    sexes: unique(dogs.map(dog => dog.gender)),
    registries: unique(
      dogs.flatMap(dog =>
        (dog.registrations ?? []).map(reg => normalizeOrganization(reg.organization))
      )
    ),
  };
}
