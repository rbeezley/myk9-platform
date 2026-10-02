import type { FieldLocation } from './usePanelValidationNavigation';

export type DogTabValue = 'basic' | 'more';

const BASIC_FIELDS = [
  'callName',
  'gender',
  'dateOfBirth',
  'color',
  'weight',
  'height',
  'microchip',
  'imageUrl',
  'ownerId',
  'notes',
  'specialNeeds',
  'spayedNeutered',
] as const;

/** Edit Dog: everything the schema checks is on Basic Info; Registrations and Health are on More. */
export const locateDogField = (field: string): FieldLocation<DogTabValue> | undefined => {
  if ((BASIC_FIELDS as readonly string[]).includes(field)) {
    return { tab: 'basic', elementId: field === 'ownerId' ? 'ownerId' : field };
  }
  if (field === 'registrations' || field === 'healthRecords') {
    return { tab: 'more', elementId: 'dog-more-tab' };
  }
  return undefined;
};
