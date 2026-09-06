import type { FilterDefinition as ChipFilterDefinition } from '@/components/common/FilterChips';
import type { ViewMode } from './browseShowsViewModes';
import { RADIUS_OPTIONS } from '@/features/location/distance';

/**
 * Cards for everyone except the secretary/admin Managing tab, whose working
 * list is the table. Guests and multi-role users used to land on the table,
 * which needed a horizontal scrollbar to read (MYK9-427).
 */
export function getDefaultViewMode(selectedTab: string): ViewMode {
  return selectedTab === 'managing' ? 'table' : 'cards';
}

export interface ChipFilterOption {
  label: string;
  value: string;
}

/**
 * The chip row above the list. Dates are the month scrubber's job, not a chip;
 * the Distance chip appears only once a location is known, since without one
 * it could filter nothing.
 */
export function buildChipFilters(
  clubOptions: ChipFilterOption[],
  { hasLocation = false }: { hasLocation?: boolean } = {}
): ChipFilterDefinition[] {
  const chips: ChipFilterDefinition[] = [
    {
      key: 'discipline',
      label: 'Discipline',
      options: [
        { label: 'Agility', value: 'agility' },
        { label: 'Scent Work', value: 'scent_work' },
        { label: 'Rally', value: 'rally' },
        { label: 'Obedience', value: 'obedience' },
      ],
    },
    {
      key: 'entryStatus',
      label: 'Entry Status',
      options: [
        { label: 'Open', value: 'open' },
        { label: 'Closing Soon', value: 'closing_soon' },
        { label: 'Waitlist', value: 'waitlist' },
        { label: 'Closed', value: 'closed' },
      ],
    },
    { key: 'club', label: 'Club', options: clubOptions },
  ];
  if (hasLocation) {
    chips.push({
      key: 'radius',
      label: 'Distance',
      options: RADIUS_OPTIONS.map(miles => ({ label: `Within ${miles} mi`, value: miles })),
    });
  }
  return chips;
}
