import type { ViewMode } from '@/hooks/useViewPreference';

/**
 * The one default-view rule (owner decision 8, MYK9-929): a staff list (managing shows, trials,
 * classes, entries, people, clubs) opens on a table; an exhibitor or public list (Find Shows,
 * My Dogs) opens on cards. Her own choice, once made, wins on every list
 * (`useViewPreference`).
 */
export function defaultListView(isStaffList: boolean): ViewMode {
  return isStaffList ? 'table' : 'cards';
}
