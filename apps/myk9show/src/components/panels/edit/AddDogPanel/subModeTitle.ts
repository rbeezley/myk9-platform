import type { AddDogSubMode } from './types';

/** The title of the panel hosting Add Dog, for the view showing now (MYK9-1116). */
export function addDogSubModeTitle(subMode: AddDogSubMode): string {
  if (subMode === 'registration-add') return 'Add New Registration';
  if (subMode === 'registration-edit') return 'Edit Registration';
  return 'Add Dog';
}
