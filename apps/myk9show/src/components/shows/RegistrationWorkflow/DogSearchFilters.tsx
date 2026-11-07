import { useMemo, useRef } from 'react';
import { ListAppliedFilters } from '@/components/list-toolkit/ListAppliedFilters';
import { ListFilterMenu } from '@/components/list-toolkit/ListFilterMenu';
import type { ListFilterMenuField, ListFilterOption } from '@/components/list-toolkit/types';
import type { Dog } from '@/types/dog-types';
import {
  AGE_OPTIONS,
  REGISTRATION_OPTIONS,
  buildDogFilterValues,
  dogMatchesGroup,
  type DogFilterGroup,
  type DogFilterSelection,
} from './dogSearchFilterState';

const GROUP_LABELS: Record<DogFilterGroup, string> = {
  registration: 'Registration',
  breed: 'Breed',
  sex: 'Sex',
  registry: 'Registry',
  age: 'Age',
};

interface DogSearchFiltersProps {
  dogs: Dog[];
  selection: DogFilterSelection;
  onSelectionChange: (selection: DogFilterSelection) => void;
  /** The registration-state group. */
  showRegistrationFilter: boolean;
  /** Breed, sex, registry and age. */
  showDetailFilters: boolean;
  /** The search text also narrows the list, so Clear all offers to reset it. */
  searchQuery: string;
  onClearAll: () => void;
}

/**
 * The dog step's one Filter button (MYK9-1742), the same menu and applied-filter row Entry Forms
 * uses (MYK9-1594): every criterion is a group of tick boxes in it, so there is no separate
 * "Advanced" panel.
 */
export function DogSearchFilters({
  dogs,
  selection,
  onSelectionChange,
  showRegistrationFilter,
  showDetailFilters,
  searchQuery,
  onClearAll,
}: DogSearchFiltersProps) {
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const fields = useMemo<ListFilterMenuField[]>(() => {
    const now = new Date();
    const values = buildDogFilterValues(dogs);
    const withCounts = (
      group: DogFilterGroup,
      options: ReadonlyArray<{ value: string; label: string }>
    ) =>
      options.map<ListFilterOption>(option => ({
        ...option,
        count: dogs.filter(dog => dogMatchesGroup(dog, group, [option.value], now)).length,
      }));
    // A ticked value stays offered after a new search drops it from the dogs on
    // hand, so it can still be seen and unticked in the menu.
    const plain = (group: DogFilterGroup, list: string[]) =>
      [...new Set([...list, ...selection[group]])].sort().map(value => ({ value, label: value }));
    const field = (
      group: DogFilterGroup,
      options: ReadonlyArray<{ value: string; label: string }>
    ): ListFilterMenuField => ({
      kind: 'multiOptions',
      key: group,
      label: GROUP_LABELS[group],
      options: withCounts(group, options),
      values: selection[group],
      onChange: next => onSelectionChange({ ...selection, [group]: next }),
    });
    return [
      ...(showRegistrationFilter ? [field('registration', REGISTRATION_OPTIONS)] : []),
      ...(showDetailFilters
        ? [
            field('breed', plain('breed', values.breeds)),
            field('sex', plain('sex', values.sexes)),
            field('registry', plain('registry', values.registries)),
            field('age', AGE_OPTIONS),
          ]
        : []),
    ];
  }, [dogs, selection, onSelectionChange, showRegistrationFilter, showDetailFilters]);

  if (fields.length === 0) return null;

  return (
    <div className="space-y-2">
      <ListFilterMenu fields={fields} triggerRef={filterButtonRef} sheetOnPhone />
      <ListAppliedFilters
        fields={fields}
        onClearAll={onClearAll}
        alsoNarrowed={!!searchQuery.trim()}
        focusTargetRef={filterButtonRef}
      />
    </div>
  );
}
