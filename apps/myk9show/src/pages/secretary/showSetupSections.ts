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

/** The Classes views a `?view=` value can open (`classesTabViews.ts`). */
const SETUP_CLASSES_VIEW_IDS = ['all', 'pending', 'completed', 'mine'] as const;

export function resolveSetupClassesView(raw: string | null): string {
  return SETUP_CLASSES_VIEW_IDS.find(id => id === raw) ?? 'all';
}

/**
 * Where "manage this show's classes" lives: Setup → Classes (MYK9-924 retired the separate
 * Class Management page). `view` opens a Classes view; 'all' is the default and stays out of
 * the URL.
 */
export function getSetupClassesHref(showId: string, view?: string): string {
  const params = new URLSearchParams({ section: 'classes' });
  if (view && view !== 'all') params.set('view', resolveSetupClassesView(view));
  return `/shows/${encodeURIComponent(showId)}/setup?${params.toString()}`;
}
