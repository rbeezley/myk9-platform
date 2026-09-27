/**
 * `ListFilterBar` field definitions for the Dogs browse page (MYK9-796):
 * Breed, Sex, and Owner. Owner is staff-only — omitted from `fields` entirely
 * (never rendered disabled) on an own-dogs-only roster, where every dog
 * belongs to the viewer and the field could only ever offer one value back at
 * them, mirroring the Owner TABLE COLUMN's own `showOwner` gate
 * (`DogsTableView`, MYK9-219).
 */
import type { ListFilterField } from '@/components/list-toolkit';
import type { DogFilters } from './dogBrowseFilters';

export interface BuildDogFilterFieldsOptions {
  filters: DogFilters;
  availableBreeds: readonly string[];
  availableOwners: readonly string[];
  /** Staff-only: false on an own-dogs-only roster (exhibitor, or judge/steward/chairman). */
  showOwnerField: boolean;
  onChange: (patch: Partial<DogFilters>) => void;
}

const SEX_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

export function buildDogFilterFields({
  filters,
  availableBreeds,
  availableOwners,
  showOwnerField,
  onChange,
}: BuildDogFilterFieldsOptions): ListFilterField[] {
  const fields: ListFilterField[] = [
    {
      kind: 'options',
      key: 'breed',
      label: 'Breed',
      value: filters.breed === 'all' ? null : filters.breed,
      onChange: value => onChange({ breed: value ?? 'all' }),
      options: availableBreeds.map(breed => ({ value: breed, label: breed })),
    },
    {
      kind: 'options',
      key: 'sex',
      label: 'Sex',
      value: filters.sex === 'all' ? null : filters.sex,
      onChange: value => onChange({ sex: value ?? 'all' }),
      options: SEX_OPTIONS,
    },
  ];

  if (showOwnerField) {
    fields.push({
      kind: 'options',
      key: 'owner',
      label: 'Owner',
      value: filters.owner === 'all' ? null : filters.owner,
      onChange: value => onChange({ owner: value ?? 'all' }),
      options: availableOwners.map(owner => ({ value: owner, label: owner })),
    });
  }

  return fields;
}
