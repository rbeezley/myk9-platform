/**
 * "Select classes" on the show home (MYK9-956/957): Class Management in place
 * at `/shows/:id?select=classes`. It replaced Setup → Classes, which replaced
 * the Class Management page (MYK9-924); every link to managing a show's
 * classes is built here.
 */

/** The `select` value that opens Select classes. */
export const SELECT_CLASSES = 'classes';

/** The Classes views a `?view=` value can open (`classesTabViews.ts`). */
const CLASSES_VIEW_IDS = ['all', 'pending', 'in_progress', 'completed', 'mine'] as const;

export function resolveSelectClassesView(raw: string | null): string {
  return CLASSES_VIEW_IDS.find(id => id === raw) ?? 'all';
}

/** The params Select classes owns; leaving it ("Done") clears them. */
export const SELECT_CLASSES_PARAMS = ['view', 'trialId', 'focus'] as const;

interface SelectClassesHrefOptions {
  /** Scope to one trial (`?trialId=`). */
  trialId?: string | undefined;
  /** Scroll to and focus one class (`?focus=`). */
  focusClassId?: string | undefined;
}

/**
 * Where "manage this show's classes" lives. `view` opens a Classes view; 'all' is the default
 * and stays out of the URL.
 */
export function getSelectClassesHref(
  showId: string,
  view?: string,
  options: SelectClassesHrefOptions = {}
): string {
  const params = new URLSearchParams({ select: SELECT_CLASSES });
  const resolvedView = resolveSelectClassesView(view ?? null);
  if (resolvedView !== 'all') params.set('view', resolvedView);
  if (options.trialId) params.set('trialId', options.trialId);
  if (options.focusClassId) params.set('focus', options.focusClassId);
  return `/shows/${encodeURIComponent(showId)}?${params.toString()}`;
}

/**
 * The show home's query for a URL that used to point at the retired Setup tab
 * (MYK9-957). `?section=classes` opens Select classes and keeps its view,
 * trial and focus; Trials and Show Map land on the home, dropping the
 * Classes-only params that would mean something else there. `returnTo` (a
 * way back to Show Day, which is now the home itself) is dropped too.
 */
export function legacySetupToHomeSearch(search: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(search);
  const section = params.get('section');
  params.delete('section');
  params.delete('returnTo');
  if (section === 'classes') {
    params.set('select', SELECT_CLASSES);
  } else {
    for (const key of SELECT_CLASSES_PARAMS) params.delete(key);
  }
  return params;
}
