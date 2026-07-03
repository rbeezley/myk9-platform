/**
 * The audience a show-detail visitor belongs to, which decides WHICH surface
 * `/shows/:id` renders. Extracted from the scattered inline conditionals in
 * ShowDetailsPage so the decision is a single, deterministic, unit-tested unit.
 *
 * - `public`     — anonymous / non-staff visitor with no entries → marketing landing.
 * - `pending`    — authenticated visitor whose entries are still loading; we defer
 *                  the decision to avoid flashing the public landing before we know
 *                  they're an entered exhibitor.
 * - `exhibitor`  — entered exhibitor (or club admin) → tabbed details UI.
 * - `management` — secretary / admin → management shell (nav, publish, edit/delete).
 */
export type ShowAudience = 'public' | 'pending' | 'exhibitor' | 'management';

export interface ShowAudienceInput {
  /** True when the URL targets a management section, e.g. `/shows/:id/setup`. */
  isManagementSection: boolean;
  /** Staff-only escape hatch for checking the public/exhibitor landing without staff chrome. */
  forcePublicPreview?: boolean;
  isSecretary: boolean;
  isAdmin: boolean;
  isClubAdmin: boolean;
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
    isSecretary,
    isAdmin,
    isClubAdmin,
    isAuthenticated,
    userEntriesLoading,
    hasUserEntries,
  } = input;

  if (forcePublicPreview && !isManagementSection) return 'public';

  // Staff (secretary / admin / club_admin) and management-section URLs always
  // reach the non-public UI — they never see the marketing landing.
  const isStaff = isSecretary || isAdmin || isClubAdmin;
  if (!isManagementSection && !isStaff) {
    // Defer while an authenticated visitor's entries resolve, so we don't flash
    // the public landing before discovering they're an entered exhibitor.
    if (isAuthenticated && userEntriesLoading) return 'pending';
    // A non-staff visitor with no entries gets the public marketing landing.
    if (!hasUserEntries) return 'public';
  }

  // Reached the tabbed UI. Secretary/admin get the management shell; everyone
  // else who lands here (entered exhibitors, club admins) gets the exhibitor view.
  return isSecretary || isAdmin ? 'management' : 'exhibitor';
}
