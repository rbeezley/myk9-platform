/**
 * Deep links into the show Edit panel.
 *
 * The panel is opened by local state in `ShowManagementShell`, not by a route, so the
 * only way another page can reach it is the query-param convention that already exists
 * for `?edit=true`: the shell reads the param on mount, opens the panel, then strips it
 * so a refresh or a shared URL does not reopen the editor.
 *
 * `editTab` extends that to say WHICH tab. It exists for F4/F12: the show's judge roster
 * is owned by the Judges tab, and every surface that assigns a judge to a class — the
 * creation wizard, Manage Classes, the class Edit panel, Add Classes — could only offer
 * a list it had no way to extend. Rather than reimplement judge management in four
 * places (which this phase of the project explicitly tries to stop), each links here.
 */

/** Query param naming the tab the Edit panel should open on. */
export const SHOW_EDIT_TAB_PARAM = 'editTab';

/** Tabs the Edit panel can be deep-linked to. Must match `ShowEditForm`'s tab values. */
export const SHOW_EDIT_TABS = ['basic', 'personnel', 'judges', 'fees', 'premium'] as const;

export type ShowEditTab = (typeof SHOW_EDIT_TABS)[number];

export const DEFAULT_SHOW_EDIT_TAB: ShowEditTab = 'basic';

/**
 * Read the requested tab, ignoring anything unrecognised.
 *
 * An unknown value falls back to the default rather than being passed through: the tab
 * value comes from a URL anyone can edit, and `Tabs` given a value with no matching
 * `TabsContent` renders an empty panel — which would read as a broken editor.
 */
export function normalizeShowEditTab(raw: string | null | undefined): ShowEditTab {
  return (SHOW_EDIT_TABS as readonly string[]).includes(raw ?? '')
    ? (raw as ShowEditTab)
    : DEFAULT_SHOW_EDIT_TAB;
}

/** Open the show's Edit panel on a given tab. */
export function getShowEditHref(showId: string, tab: ShowEditTab = DEFAULT_SHOW_EDIT_TAB): string {
  const params = new URLSearchParams({ edit: 'true' });
  if (tab !== DEFAULT_SHOW_EDIT_TAB) params.set(SHOW_EDIT_TAB_PARAM, tab);
  return `/shows/${showId}?${params.toString()}`;
}

/** The one place that owns which judges a show has. */
export function getShowJudgesHref(showId: string): string {
  return getShowEditHref(showId, 'judges');
}
