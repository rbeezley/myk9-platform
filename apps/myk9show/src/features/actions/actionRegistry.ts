import {
  buildExhibitorRegistrationPath,
  buildSecretaryRegistrationPath,
} from '@/pages/RegistrationWizardPage.routes';
import { SHOW_SHELL_CHILD_SEGMENTS } from '@/routes/showManagementSections';
import { getAddClassesHref } from '@/pages/secretary/ShowCreationWizard/addClassesHref';
import { getAddTrialsHref } from '@/pages/secretary/ShowCreationWizard/addTrialsHref';
import { TRIAL_SECRETARY_ONLY_REASON } from './trialSecretaryAccess';
import { CREATE_HREFS, type CreateGates } from './createGates';

/**
 * THE registry of "what can I do from here" (MYK9-630).
 *
 * One ordered list per route context, resolved by a pure function so the app
 * header's Actions menu and the command palette read the SAME list and can
 * never disagree (Richard, 2026-09-17: "one place to go... always visible... if
 * an option is not relevant it would be grayed out").
 *
 * Two rules the shape encodes:
 * - An item that BELONGS to this context but is unavailable is returned with a
 *   one-line `disabledReason`. An item that does not belong is simply absent --
 *   never a grey row the viewer could never use.
 * - Every item is a LINK into the canonical surface, never a second
 *   implementation of it (CLAUDE.md, consolidate don't duplicate).
 */
/**
 * A named side effect the registry cannot perform itself, because it needs
 * React state the pure resolver has no access to. `useCurrentActions` binds
 * each one to a real callback; nothing else may invent a command.
 */
export type ActionCommand = 'publish-premium' | 'edit-object' | 'page-export' | 'page-extra';

/**
 * The objects whose DETAIL page owns an Edit panel (the show's own Edit is a
 * search-only link, because its shell is mounted by the router). A page tells the
 * header it is on screen and the viewer may edit it by registering one of these
 * (`usePageEditAction`), so the gate is the page's own -- the one its old Edit
 * button used -- and the header menu needs no second copy of it.
 */
export type EditableObjectKind = 'trial' | 'class' | 'club' | 'dog' | 'person';

/**
 * The menu's labelled sections, in the order they render (CRUD standard decision 6):
 * the detail page's own object, then the show it sits in, then the lists on screen, then
 * Create, which is the same on every page. Each section is headed by a name, never a
 * divider alone, so the viewer can tell what an item applies to.
 */
export const ACTION_GROUP_ORDER = ['page', 'show', 'list', 'create'] as const;
export type ActionGroupId = (typeof ACTION_GROUP_ORDER)[number];

/** Resolved to a component by `actionIcons.ts`, so this module stays free of React. */
export type ActionIconName =
  | 'edit'
  | 'add-entry'
  | 'add-entry-other'
  | 'add-trial'
  | 'add-classes'
  | 'entry-forms'
  | 'premium'
  | 'export'
  | 'add-show'
  | 'add-dog'
  | 'add-person'
  | 'add-club'
  | 'photo'
  | 'status'
  | 'send'
  | 'authorize'
  | 'revoke'
  | 'close-out'
  | 'reports';

/**
 * One more thing a detail page lets this viewer do to its object, beyond Edit: Change Photo,
 * Suspend account, Authorize Club. These lived in a ⋮ on the page's hero card until CRUD
 * standard decision 6 gave every page action one home. The page owns the gate (it registers
 * only what this viewer may do) and the callback; the registry only places it.
 */
export interface PageExtraItem {
  /** Unique on the page ('photo', 'status'); the action id is `<kind>-<id>`. */
  id: string;
  label: string;
  icon: ActionIconName;
  /** Belongs here but is unavailable right now, with the one-line reason. */
  disabledReason?: string | undefined;
}

export interface PageObject {
  kind: EditableObjectKind;
  /**
   * Whether this viewer may edit the object. False keeps the page's other items (a person
   * the viewer may suspend but not edit) without offering an Edit that would be refused.
   */
  canEdit?: boolean | undefined;
  /**
   * Where "Add classes" goes, for a trial page whose viewer may add them. Absent
   * means no such action is offered (read-only viewer, or no show to open it on).
   */
  addClassesHref?: string | undefined;
  /** The page's other actions on its object, in the order they should appear. */
  extras?: readonly PageExtraItem[] | undefined;
}

export interface AppAction {
  id: string;
  label: string;
  /**
   * Where this action lives, for the items that ARE a destination. A
   * search-only value is allowed for actions that intentionally operate on the
   * viewer's current path.
   */
  href?: string;
  /**
   * Set instead of `href` when the action is a side effect rather than a
   * place. A hash link is NOT an acceptable stand-in: the router pushes a hash
   * without fragment navigation, so nothing scrolls and `:target` never
   * matches (MYK9-630 round 3 review).
   */
  command?: ActionCommand;
  /** Bound by `useCurrentActions` for `command` items; absent in the pure layer. */
  run?: () => void;
  /** Present when the item belongs here but the viewer cannot use it. */
  disabledReason?: string;
  /** Which labelled section of the menu this item sits in (CRUD standard decision 6). */
  group: ActionGroupId;
  /** One icon per action, the same in the header menu and the command palette. */
  icon: ActionIconName;
  destructive?: boolean;
  /**
   * Search-only synonyms for the command palette, never displayed. For words a
   * user will type that the label deliberately does not carry (MYK9-672).
   */
  aliases?: readonly string[];
}

export type ActionRouteContext =
  | {
      kind: 'show';
      showId: string;
      /**
       * Whether `ShowManagementShell` — the only thing that consumes
       * `?edit=true` — is mounted at this path. False on the show's SIBLING
       * routes (`/register`, `/trials/...`), which are not nested under
       * `/shows/:id` and so render no shell at all.
       */
      shellMounted: boolean;
    }
  | { kind: 'global' };

export interface ActionViewer extends CreateGates {
  /** May manage THIS show -- the same gate the management routes use. */
  canManageShow: boolean;
  /**
   * Holds the operational trial-secretary (or site-admin) role over this show.
   * Strictly narrower than `canManageShow`: a club admin manages the show's
   * lifecycle, but `/secretary/register/:showId` is gated on SECRETARY /
   * SITE_ADMIN (`routes/secretaryRoutes.tsx`), so mail-in entry is not theirs.
   */
  canOperateShow: boolean;
  /**
   * The detail page on screen, when its viewer may edit it. Registered by the page
   * itself so the gate is the one its Edit button used (MYK9-928).
   */
  pageObject?: PageObject | null | undefined;
  /**
   * The trial Setup -> Classes has selected, so the show-wide "Add classes" opens the wizard
   * focused on it, as the toolbar button it replaced did.
   */
  addClassesTrialId?: string | null | undefined;
  /**
   * Whole-list "Export CSV" actions the lists on screen registered (`usePageExportAction`), by
   * list id. They form the menu's list section.
   */
  pageExports?: ReadonlyArray<{ id: string }> | undefined;
}

const SHOW_PATH = /^\/shows\/([^/]+)(?:\/|$)/;
const SECRETARY_REGISTER_PATH = /^\/secretary\/register\/([^/]+)(?:\/|$)/;

/**
 * Segments that sit where a show id sits but name no show. `/shows/new` and
 * `/shows/browse` are both real routes (`publicRoutes.tsx` redirects them into
 * the create-show wizard and the browse list), so without this they parsed as
 * `{ kind: 'show', showId: 'new' | 'browse' }` and the header offered seven
 * actions against a show that does not exist.
 *
 * Exported so `actionRegistry.routeSegments.test.ts` can check this list
 * against the REAL route tree and fail loudly when a new literal is added --
 * importing the route tree here would make the resolver anything but pure.
 */
export const NON_SHOW_ID_SEGMENTS = new Set(['new', 'browse']);

/**
 * The child segments of `/shows/:id`, i.e. the paths where
 * `ShowManagementShell` is mounted and can honour a `?edit=true` the viewer
 * arrives with. Read straight off the route model, so the six tabs, their
 * legacy redirect paths and `classes/:trialId[/create]` are all covered and a
 * seventh tab cannot be added to one list and not the other.
 *
 * Fail CLOSED: anything not listed is treated as shell-less and gets the
 * absolute link, which always works. `actionRegistry.routeSegments.test.tsx`
 * checks both halves against the real `PublicRoutes()` tree.
 */
export const SHELL_MOUNTED_CHILD_SEGMENTS = new Set<string>(SHOW_SHELL_CHILD_SEGMENTS);

const SHOW_CHILD_PATH = /^\/shows\/[^/]+(?:\/([^/]+))?/;

/**
 * Is the show management shell mounted at this path? `/shows/:id` itself and
 * its nested children yes; its siblings no.
 */
export function isShowShellMountedPath(pathname: string): boolean {
  const match = SHOW_CHILD_PATH.exec(pathname);
  if (!match) return false;
  const child = match[1];
  if (child === undefined || child === '') return true;
  return SHELL_MOUNTED_CHILD_SEGMENTS.has(child);
}

/**
 * The route context a pathname puts the viewer in. Pure, so both doors (header
 * menu and command palette) derive it identically and it is unit-testable
 * without a router.
 */
export function parseActionRouteContext(pathname: string): ActionRouteContext {
  for (const pattern of [SHOW_PATH, SECRETARY_REGISTER_PATH]) {
    const match = pattern.exec(pathname);
    const raw = match?.[1];
    if (!raw) continue;
    const showId = decodeURIComponent(raw);
    if (NON_SHOW_ID_SEGMENTS.has(showId)) return { kind: 'global' };
    return { kind: 'show', showId, shellMounted: isShowShellMountedPath(pathname) };
  }
  return { kind: 'global' };
}

/**
 * A search-only href (`?edit=true`) resolved against the viewer's current
 * query string: the action's params are added to the ones already there, and
 * win a shared key. A bare `?edit=true` link replaced the whole query, so
 * Entry Management lost its queue, search and selection behind the edit panel
 * (MYK9-736 Codex review). Absolute hrefs pass through untouched.
 */
export function mergeSearchOnlyHref(href: string, currentSearch: string): string {
  if (!href.startsWith('?')) return href;
  const merged = new URLSearchParams(currentSearch);
  new URLSearchParams(href).forEach((value, key) => merged.set(key, value));
  return `?${merged.toString()}`;
}

function buildShowActions(
  showId: string,
  shellMounted: boolean,
  viewer: ActionViewer
): AppAction[] {
  if (!viewer.canManageShow) return [];

  const encoded = encodeURIComponent(showId);
  // Id is stable on purpose -- it is the action's identity, not its wording.
  // The label names WHOSE dog, not why (docs/reference/ui-vocabulary.md).
  const entryForSomeoneElse: AppAction = {
    id: 'show-add-mail-in-entry',
    label: 'Add entry for someone else',
    // The reasons the label leaves out stay findable: "mail-in" is still the
    // domain noun secretaries, guides and entry blanks use (MYK9-672).
    aliases: ['mail-in', 'paper', 'phone', 'walk-up', 'on behalf'],
    href: buildSecretaryRegistrationPath(showId),
    group: 'show',
    icon: 'add-entry-other',
    ...(viewer.canOperateShow ? {} : { disabledReason: TRIAL_SECRETARY_ONLY_REASON }),
  };

  // Group order (docs/plan-crud-standard.md): Edit, then Add, then the rest,
  // then status changes. Edit first on every page, so the one place to look
  // for "change this" is the same everywhere.
  return [
    {
      // The show's one edit entry point (MYK9-736, MYK9-928): there is no header
      // Edit button any more, and a "Show Details" item here was only a self-link
      // on the page it named. Same audience as the button it replaced -- this
      // whole list is `canManageShow`-gated, exactly like `ShowManagementShell`,
      // which owns the panel.
      //
      // SEARCH-ONLY where the shell is mounted, so the panel opens on the
      // section the secretary is already on: an absolute `/shows/:id?edit=true`
      // walked them off Entry Management to Overview and stranded them there
      // when they closed it. On a SIBLING route (`/register`, `/trials/...`) no
      // shell is mounted, so a relative param would sit in the URL with nothing
      // to consume it; there the item goes to the show page, where the panel
      // lives.
      id: 'show-settings',
      label: 'Edit show',
      aliases: ['show details', 'edit show details', 'settings'],
      href: shellMounted ? '?edit=true' : `/shows/${encoded}?edit=true`,
      group: 'show',
      icon: 'edit',
    },
    entryForSomeoneElse,
    {
      id: 'show-enter-own-dogs',
      label: 'Add entry for my dog',
      href: buildExhibitorRegistrationPath(showId),
      group: 'show',
      icon: 'add-entry',
    },
    {
      id: 'show-add-new-trial',
      label: 'Add Trial',
      href: getAddTrialsHref(showId),
      group: 'show',
      icon: 'add-trial',
    },
    {
      // The show-level door into the one class-create flow (the Setup toolbar
      // button it replaces); a trial page offers its own, focused on that trial.
      id: 'show-add-classes',
      label: 'Add classes',
      href: getAddClassesHref(showId, viewer.addClassesTrialId),
      group: 'show',
      icon: 'add-classes',
    },
    {
      id: 'show-open-entry-management',
      label: 'Open Entry Forms',
      href: `/shows/${encoded}/entries`,
      group: 'show',
      icon: 'entry-forms',
    },
    {
      // Runs the Premium List card's OWN flow, from whatever section the
      // secretary is on. It was a link to the card's anchor, which the router
      // could not honour: a pushed hash is not fragment navigation, so at
      // 375px nothing scrolled at all and from another section the card
      // arrived unhighlighted.
      id: 'show-generate-publish-premium',
      label: 'Generate & publish premium',
      command: 'publish-premium',
      group: 'show',
      icon: 'premium',
    },
    {
      // The Results section's own close-out step, opened on it (CRUD standard decision 6);
      // the step's confirm dialog does the work. Same gate as the route.
      id: 'show-close-out',
      label: 'Close out show',
      href: `/shows/${encoded}/results?step=close`,
      group: 'show',
      icon: 'close-out',
    },
  ];
}

/**
 * The Create group: the same on every page, so a first-time secretary never has to know which
 * page to visit before starting something. It holds ONLY objects with no parent; a trial, class
 * or entry is created from its parent's own group, so the parent is never in doubt (CRUD
 * standard decision 6). Each item links to its list page's existing create panel. "Open Show
 * Management" used to sit here; it is navigation, and lives in the sidebar and the palette.
 */
function buildCreateActions(viewer: ActionViewer): AppAction[] {
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

/**
 * The Edit (and Add) item(s) for the detail page on screen. Edit is always the
 * first item; there is no page-level Edit button anywhere (MYK9-928).
 */
function buildPageObjectActions(pageObject: PageObject | null | undefined): AppAction[] {
  if (!pageObject) return [];
  const { kind } = pageObject;
  const actions: AppAction[] = [];
  if (pageObject.canEdit !== false) {
    actions.push({
      id: `${kind}-edit`,
      label: `Edit ${kind}`,
      command: 'edit-object',
      group: 'page',
      icon: 'edit',
    });
  }
  if (kind === 'trial' && pageObject.addClassesHref) {
    actions.push({
      id: 'trial-add-classes',
      label: 'Add classes',
      href: pageObject.addClassesHref,
      group: 'page',
      icon: 'add-classes',
    });
  }
  for (const extra of pageObject.extras ?? []) {
    actions.push({
      id: `${kind}-${extra.id}`,
      label: extra.label,
      command: 'page-extra',
      group: 'page',
      icon: extra.icon,
      ...(extra.disabledReason ? { disabledReason: extra.disabledReason } : {}),
    });
  }
  return actions;
}

/**
 * The ordered actions for one route context, already in `ACTION_GROUP_ORDER`. An empty list
 * means the header button is HIDDEN, not disabled.
 *
 * The detail page's own object comes first, then the show it sits in, then the lists on
 * screen, then Create. `groupActions` turns this flat list into the labelled sections.
 */
export function resolveActions(route: ActionRouteContext, viewer: ActionViewer): AppAction[] {
  const own = buildPageObjectActions(viewer.pageObject);
  // One "Add classes": a trial page's own (focused on that trial) replaces the show-wide one.
  const hasTrialAddClasses = own.some(action => action.id === 'trial-add-classes');
  const show = (
    route.kind === 'show' ? buildShowActions(route.showId, route.shellMounted, viewer) : []
  ).filter(action => !(hasTrialAddClasses && action.id === 'show-add-classes'));
  const exports: AppAction[] = (viewer.pageExports ?? []).map(item => ({
    id: `page-export-${item.id}`,
    label: 'Export CSV',
    command: 'page-export',
    group: 'list',
    icon: 'export',
  }));
  return [...own, ...show, ...exports, ...buildCreateActions(viewer)];
}
