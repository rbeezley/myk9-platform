/**
 * The registration wizard's own titles, as a pure function of the two modes
 * that reach it.
 *
 * Extracted from `useRegistrationWizardState` so the vocabulary standard
 * (docs/reference/ui-vocabulary.md) has a local guard. Before this, the only
 * coverage of these strings was four Playwright heading assertions that need
 * staging, so a rename could pass every check a laptop can run.
 *
 * `Add late entry` deliberately keeps its modifier while `Add entry for someone
 * else` dropped "mail-in": late entry is a different OPERATION, not a different
 * reason for the ordinary one. It exits to the Show Desk, switches entry
 * creation to the offline-first path, and turns off the client-side fullness
 * check. See the doc's "Modes are not reasons".
 *
 * It does NOT relax the entry-close deadline. That exemption is RBAC --
 * `getEntryCloseSubmitBlocker` returns early on `workflowMode !== 'exhibitor'`
 * and deliberately ignores `isLateEntryMode`, because any exhibitor can append
 * the query param. Do not wire the deadline to this mode.
 */
export interface WizardTitleModes {
  /** `?source=show-desk&entryMode=late` — bypasses the entry-close guard. */
  isLateEntryMode: boolean;
  /** Rendered inside the secretary sidebar, i.e. entering on someone's behalf. */
  isInsideSidebar: boolean;
}

export interface WizardTitles {
  /** Breadcrumb tail. */
  workflowLabel: string;
  /** Sidebar `<h1>`. */
  sidebarTitle: string;
  /** Sub-line under the `<h1>`; absent for an exhibitor entering their own dogs. */
  workflowSubtitle: string | undefined;
}

export function resolveWizardTitles({
  isLateEntryMode,
  isInsideSidebar,
}: WizardTitleModes): WizardTitles {
  return {
    workflowLabel: isLateEntryMode
      ? 'Late entry'
      : isInsideSidebar
        ? 'Entry for someone else'
        : 'Register',
    sidebarTitle: isLateEntryMode
      ? 'Add late entry'
      : isInsideSidebar
        ? 'Add entry for someone else'
        : 'Register for Show',
    workflowSubtitle: isInsideSidebar ? 'Enter on behalf of an exhibitor.' : undefined,
  };
}
