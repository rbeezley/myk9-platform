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
const SETUP_CLASSES_VIEW_IDS = ['all', 'pending', 'in_progress', 'completed', 'mine'] as const;

export function resolveSetupClassesView(raw: string | null): string {
  return SETUP_CLASSES_VIEW_IDS.find(id => id === raw) ?? 'all';
}

/** The params the Setup page owns for its Classes section; leaving the section clears them. */
export const SETUP_CLASSES_PARAMS = ['view', 'trialId', 'focus'] as const;

interface SetupClassesHrefOptions {
  /** Scope the Classes section to one trial (`?trialId=`). */
  trialId?: string | undefined;
  /** Scroll to and focus one class (`?focus=`). */
  focusClassId?: string | undefined;
  /** The Show Desk URL to offer a way back to (`ShowDeskReturnLink`). */
  returnTo?: string | undefined;
}

/**
 * Where "manage this show's classes" lives: Setup → Classes (MYK9-924 retired the separate
 * Class Management page). `view` opens a Classes view; 'all' is the default and stays out of
 * the URL.
 */
export function getSetupClassesHref(
  showId: string,
  view?: string,
  options: SetupClassesHrefOptions = {}
): string {
  const params = new URLSearchParams({ section: 'classes' });
  const resolvedView = resolveSetupClassesView(view ?? null);
  if (resolvedView !== 'all') params.set('view', resolvedView);
  if (options.trialId) params.set('trialId', options.trialId);
  if (options.focusClassId) params.set('focus', options.focusClassId);
  const returnTo = options.returnTo ? `&returnTo=${encodeURIComponent(options.returnTo)}` : '';
  return `/shows/${encodeURIComponent(showId)}/setup?${params.toString()}${returnTo}`;
}
