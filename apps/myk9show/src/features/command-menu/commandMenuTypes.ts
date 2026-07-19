import type { ReactNode } from 'react';

/**
 * Owner surface that can register contextual command-menu state. Extensible
 * union — Entry Management is the only surface in this release (see
 * openspec/changes/context-aware-command-menu/design.md Decision 2).
 */
export type CommandMenuSurfaceId = 'entry-management';

/**
 * Context an owner page registers with the command palette on mount. Mirrors
 * the "Context plumbing" resolution in design.md's Open Questions: the page
 * owns selection, eligibility, and the mutation handler; the palette only
 * reads this and delegates.
 */
export interface CommandMenuContext {
  surface: CommandMenuSurfaceId;
  showId: string;
  trialId?: string | undefined;
  /** Currently selected entry IDs on the owner surface (row/bulk selection). */
  selectedEntryIds: readonly string[];
  /** Subset of `selectedEntryIds` eligible for check-in, precomputed by the
   * page via `getEligibleForBulkAction` — the palette never recomputes
   * eligibility itself. */
  eligibleCheckInIds: readonly string[];
  /** The page's registered bulk check-in handler (e.g.
   * `handleEnrollmentBulkCheckIn`) — same handler the bulk action bar calls. */
  runBulkCheckIn: (ids: readonly string[]) => void | Promise<unknown>;
  /** True while a mutation from this surface is in flight; contextual
   * mutating commands must not be offered while busy. */
  busy: boolean;
}

export type CommandMenuGroup = 'navigation' | 'go-to' | 'actions' | 'recent';

/**
 * A single palette-renderable command. Kept compatible with the existing
 * `CommandAction` shape in `src/components/common/CommandPalette.tsx`
 * (id/title-ish label, icon, action/run) so Batch B can adapt this into that
 * component's local type without reshaping either side.
 */
export interface CommandMenuCommand {
  id: string;
  group: CommandMenuGroup;
  label: string;
  sublabel?: string;
  icon?: ReactNode;
  /** Present for navigation-style commands. */
  href?: string;
  /** Present for action-style commands; mutually exclusive with `href` in
   * practice, but both are optional so callers can decide precedence. */
  run?: () => void | Promise<unknown>;
  /** Show this command applies to, when different from — or narrower than —
   * the current route's show. Palette should label cross-show results. */
  showScope?: string;
}
