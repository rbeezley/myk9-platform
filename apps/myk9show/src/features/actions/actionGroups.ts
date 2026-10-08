import {
  ACTION_GROUP_ORDER,
  type ActionGroupId,
  type AppAction,
  type EditableObjectKind,
} from './actionRegistry';

/** One labelled section of the Actions menu. */
export interface ActionGroup {
  id: ActionGroupId;
  heading: string;
  actions: AppAction[];
}

export type ActionGroupHeadings = Record<ActionGroupId, string>;

/**
 * The name each list that registers a whole-list export goes by, for the "this list" heading.
 * Keyed by the id the list passes to `usePageExportAction`.
 */
const LIST_HEADINGS: Readonly<Record<string, string>> = {
  shows: 'Shows',
  clubs: 'Clubs',
  dogs: 'Dogs',
  people: 'People',
  trials: 'Trials',
  classes: 'Classes',
  'class-results': 'Results',
  waitlist: 'Waitlist',
};

/** The "this list" heading: the list's own name, or a plain fallback when it has none. */
export function listHeading(exportIds: readonly string[]): string {
  if (exportIds.length === 1) return LIST_HEADINGS[exportIds[0] ?? ''] ?? 'This list';
  return 'Lists on this page';
}

/**
 * The page object's heading: its name when the page gave one, else "This dog" and so on.
 * The fallback covers the moment before the object's name has loaded.
 */
export function pageObjectHeading(kind: EditableObjectKind, title: string | undefined): string {
  const trimmed = title?.trim();
  return trimmed ? trimmed : `This ${kind}`;
}

/**
 * Split the resolved list into labelled sections in `ACTION_GROUP_ORDER`, dropping empty
 * ones. Items keep their resolved order inside a section.
 */
export function groupActions(
  actions: readonly AppAction[],
  headings: ActionGroupHeadings
): ActionGroup[] {
  return ACTION_GROUP_ORDER.map(id => ({
    id,
    heading: headings[id],
    actions: actions.filter(action => action.group === id),
  })).filter(group => group.actions.length > 0);
}

/**
 * Whether the header shows the Actions button for these sections. Hidden when the only thing
 * it would hold is Add Dog: an exhibitor's whole menu off their own pages. That viewer adds
 * dogs from My Dogs and the Dogs page, and on a phone the button cost the wordmark its last
 * 44px once the cart badge showed ("myK9S...", owner decision 2026-10-08). Anything else --
 * a page, show or list item, or a staff create -- keeps the button.
 */
export function headerShowsActions(groups: readonly ActionGroup[]): boolean {
  const ids = groups.flatMap(group => group.actions.map(action => action.id));
  return ids.length > 0 && !(ids.length === 1 && ids[0] === 'create-dog');
}
