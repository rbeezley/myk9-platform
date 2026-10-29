import { buildSecretaryRegistrationPath } from '@/pages/RegistrationWizardPage.routes';
import { CREATE_HREFS, type CreateGates } from './createGates';
import type { ActionRouteContext, AppAction } from './actionRegistry';

/** A show the viewer may key an entry for (see `filterEntryEligibleShows`). */
export interface EntryShowOption {
  id: string;
  name: string;
}

export const ADD_ENTRY_NO_SHOW_REASON =
  'Add Entry needs a published show you run as trial secretary.';

export interface CreateViewer extends CreateGates {
  /** Holds SECRETARY or SITE_ADMIN, the roles `/secretary/register/:showId` admits. */
  canAddEntries?: boolean | undefined;
  /** Live shows (today and upcoming) where the viewer may key an entry. */
  entryShows?: readonly EntryShowOption[] | undefined;
  /**
   * May manage THIS show -- the same gate the management routes use. Here: whether the show on
   * screen offers its own Add entry.
   */
  canManageShow: boolean;
}

/**
 * Add Entry, the secretary's most frequent pre-show task (MYK9-902), from anywhere (MYK9-1490).
 * One eligible show goes straight to it; several open the "Add entry to which show?" picker;
 * none keeps the item, greyed with the reason.
 */
function buildAddEntryAction(entryShows: readonly EntryShowOption[]): AppAction {
  const base = {
    id: 'create-entry',
    label: 'Add Entry',
    aliases: ['new', 'create', 'mail-in', 'paper', 'phone', 'walk-up', 'on behalf'],
    group: 'create' as const,
    icon: 'add-entry' as const,
  };
  const [only] = entryShows;
  if (!only) return { ...base, disabledReason: ADD_ENTRY_NO_SHOW_REASON };
  if (entryShows.length === 1) return { ...base, href: buildSecretaryRegistrationPath(only.id) };
  return { ...base, command: 'pick-entry-show' };
}

/**
 * The Create group: the same on every page, so a first-time secretary never has to know which
 * page to visit before starting something. Each item links to its list page's existing create
 * panel. A trial or class is created from its parent's own group, so the parent is never in
 * doubt (CRUD standard decision 6). Add Entry is the one child kept here, because a secretary
 * keying mail-ins starts from anywhere; inside a show they manage, the show's own Add entry is
 * that show's, so this one steps aside rather than offer the same act twice. "Open Show
 * Management" used to sit here; it is navigation, and lives in the sidebar and the palette.
 */
export function buildCreateActions(route: ActionRouteContext, viewer: CreateViewer): AppAction[] {
  const actions: AppAction[] = [];
  if (viewer.canCreateShows) {
    actions.push({
      id: 'create-show',
      label: 'Add Show',
      aliases: ['new', 'create', 'event'],
      href: CREATE_HREFS.show,
      group: 'create',
      icon: 'add-show',
    });
  }
  if (viewer.canAddEntries && !(route.kind === 'show' && viewer.canManageShow)) {
    actions.push(buildAddEntryAction(viewer.entryShows ?? []));
  }
  if (viewer.canCreateDogs) {
    actions.push({
      id: 'create-dog',
      label: 'Add Dog',
      aliases: ['new', 'create'],
      href: CREATE_HREFS.dog,
      group: 'create',
      icon: 'add-dog',
    });
  }
  if (viewer.canCreatePeople) {
    actions.push({
      id: 'create-person',
      label: 'Add Person',
      aliases: ['new', 'create', 'contact'],
      href: CREATE_HREFS.person,
      group: 'create',
      icon: 'add-person',
    });
  }
  if (viewer.canCreateClubs) {
    actions.push({
      id: 'create-club',
      label: 'Add Club',
      aliases: ['new', 'create'],
      href: CREATE_HREFS.club,
      group: 'create',
      icon: 'add-club',
    });
  }
  return actions;
}
