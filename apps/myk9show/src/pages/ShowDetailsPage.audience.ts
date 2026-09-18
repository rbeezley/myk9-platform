/**
 * The audience a show-detail visitor belongs to, which decides WHICH surface
 * `/shows/:id` renders. Extracted from the scattered inline conditionals in
 * ShowDetailsPage so the decision is a single, deterministic, unit-tested unit.
 *
 * - `public`     — anonymous / non-staff visitor with no entries → marketing landing.
 * - `pending`    — authenticated visitor whose entries are still loading; we defer
 *                  the decision to avoid flashing the public landing before we know
 *                  they're an entered exhibitor.
 * - `exhibitor`  — entered exhibitor → tabbed details UI.
 * - `management` — anyone who manages THIS show (site admin, club-scoped
 *                  secretary, club-scoped club admin) → management shell.
 *
 * ONE predicate decides it: `canManageShow`, i.e. `canManageShowSurface` /
 * `useShowManageGate`. The same gate admits the section routes
 * (`ShowManagementSectionRoute`), builds the header Actions menu
 * (`actionRegistry`) and mounts the Show settings panel, so no two of them can
 * disagree about who manages a show.
 *
 * MYK9-630 phase 3 (Richard, 2026-09-18) collapsed the split this file used to
 * carry. #2180 introduced a second, narrower `isManagementStaff` (site admin OR
 * scoped secretary) to pick the surface while `canManageShow` admitted club
 * admins everywhere else. Every finding that followed came out of that gap: a
 * blank `/shows/:id/setup` for a club admin (fixed in #2331) and an inert
 * "Show settings…" that stranded `?edit=true` in their URL (MYK9-653). Club
 * admins are managers; they get the six tabs.
 */
export type ShowAudience = 'public' | 'pending' | 'exhibitor' | 'management';

export interface ShowAudienceInput {
  /** True when the URL targets a management section, e.g. `/shows/:id/setup`. */
  isManagementSection: boolean;
  /** Staff-only escape hatch for checking the public/exhibitor landing without staff chrome. */
  forcePublicPreview?: boolean;
  /** THE gate: may this viewer manage this show? `useShowManageGate`. */
  canManageShow: boolean;
  /** RBAC is still resolving, so staff access is unknown. */
  rbacLoading?: boolean;
  /** Whether a user is signed in at all. */
  isAuthenticated: boolean;
  /** The my-entries query is still resolving — can't yet tell public from exhibitor. */
  userEntriesLoading: boolean;
  hasUserEntries: boolean;
}

export function resolveShowAudience(input: ShowAudienceInput): ShowAudience {
  const {
    isManagementSection,
    forcePublicPreview,
    canManageShow,
    rbacLoading = false,
    isAuthenticated,
    userEntriesLoading,
    hasUserEntries,
  } = input;

  if (forcePublicPreview && !isManagementSection) return 'public';

  if (isAuthenticated && rbacLoading) return 'pending';

  // Managers and management-section URLs always reach the non-public UI — they
  // never see the marketing landing.
  if (!isManagementSection && !canManageShow) {
    // Defer while an authenticated visitor's entries resolve, so we don't flash
    // the public landing before discovering they're an entered exhibitor.
    if (isAuthenticated && userEntriesLoading) return 'pending';
    // A non-staff visitor with no entries gets the public marketing landing.
    if (!hasUserEntries) return 'public';
  }

  // Reached the tabbed UI. A manager of this show gets the management shell and
  // its six tabs; everyone else (entered exhibitors, and non-managers who
  // deep-linked a section URL the route itself will bounce) gets the exhibitor
  // view.
  return canManageShow ? 'management' : 'exhibitor';
}
