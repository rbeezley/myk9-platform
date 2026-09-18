/**
 * The three views inside the Setup tab (MYK9-630 phase 2). Pure, and in their
 * own module so `ShowWorkbenchSetupPage.tsx` exports nothing but its component
 * — a module that exports both breaks React Fast Refresh for the page.
 */
export const SETUP_SECTIONS = [
  { id: 'trials', label: 'Trials' },
  { id: 'classes', label: 'Classes' },
  { id: 'map', label: 'Show Map' },
] as const;

export type SetupSectionId = (typeof SETUP_SECTIONS)[number]['id'];

/** The view a `?section=` value selects, falling back to Trials. */
export function resolveSetupSection(raw: string | null, canShowMap: boolean): SetupSectionId {
  if (raw === 'classes') return 'classes';
  if (raw === 'map') return canShowMap ? 'map' : 'trials';
  return 'trials';
}
