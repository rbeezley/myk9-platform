/**
 * EntryListPageProps & CombinedEntryListPageProps — controlled-render
 * page contracts for the EntryList page tree in @myk9/ringside.
 *
 * Status: PR E2d-1 (interfaces only)
 * ----------------------------------
 * This file ships the page-level DI contracts ahead of the actual
 * component moves, mirroring the precedent set by PR E2c (slot types
 * shipped before the page). E2d-2 will:
 *  - Add `EntryListLayoutSlots` with the host-UI primitives currently
 *    sketched below as TODO markers.
 *  - Move the page tree (EntryList.tsx, CombinedEntryList.tsx, the
 *    components/ subtree, SortableEntryCard*, helpers, print
 *    dispatcher) into `packages/ringside/src/pages/EntryList/`.
 *  - Refactor each moved component to consume from these props bags
 *    instead of importing from apps/myk9q directly.
 *  - Build the host shim that owns state, calls the three host hooks
 *    (`useEntryListHandlers`, `useEntryListActions`,
 *    `useEntryListEffects`), assembles all the slot bags, and renders
 *    the ringside page.
 *
 * Why split this way?
 * -------------------
 * Reading the host components surfaced a transitive-coupling cost the
 * file-audit didn't capture: `EntryListHeader`, `EntryListContent`,
 * `SortableEntryCard`, and friends each import ~3-5 UI primitives
 * from apps/myk9q's local `components/ui/` and `components/dialogs/`
 * trees (HamburgerMenu, CompactOfflineIndicator, SyncIndicator,
 * RefreshIndicator, FilterPanel, FilterTriggerButton, TabBar,
 * DogCard, ClassDetailsPopover, ErrorState, PullToRefresh). Moving
 * the components into ringside without first designing the layout
 * slot bag would either (a) drag ~10 UI primitives into ringside as
 * scope creep, or (b) result in broken imports that the next PR has
 * to fix anyway.
 *
 * Shipping the contract first lets E2d-2's review be entirely about
 * "are these the right primitives to slot?" rather than "are these
 * the right props *and* the right slot design?"
 *
 * Architecture (A1 — Maximal slot-injection)
 * ------------------------------------------
 * Ringside pages own no UI state. The host shim owns useState for
 * every dialog open/close flag, drag mode, loading guard, etc., and
 * passes both the current value AND its setter through these props.
 * The page is a pure controlled render — re-render it with the same
 * props bag and you get the same DOM.
 *
 * See `./hookContracts.ts` for the handler/action bag definitions
 * and the rationale for keeping the hooks themselves host-side.
 */

import type { Dispatch, SetStateAction } from 'react';
import type { Entry } from '../../stores/entryStore';
import type { EntryListData, ClassInfo, SortOrder, PrintDialogState } from './types';
import type { EntryListDialogSlots } from './dialogSlots';
import type { EntryListHandlers, EntryListActions } from './hookContracts';
import type { TabType, SortType } from './hooks/useEntryListFilters';

// =============================================================================
// EntryListLayoutSlots — TODO marker for E2d-2
// =============================================================================

/**
 * UI primitives the page tree currently imports directly from
 * apps/myk9q. E2d-2 will fill this out as a `ComponentType` slot bag
 * mirroring the `EntryListDialogSlots` pattern from PR E2c.
 *
 * Enumerated below as a documentation contract so reviewers can sanity
 * check the surface area before the component move lands. The shape
 * is intentionally `unknown` for now — typing each slot requires
 * extracting its Props interface from the host component, which is
 * E2d-2 work.
 *
 * Slots E2d-2 will need (verified by reading the actual imports in
 * EntryListHeader.tsx, EntryListContent.tsx, SortableEntryCard.tsx,
 * EntryList.tsx, CombinedEntryList.tsx):
 *
 *  - `HamburgerMenu` — top-left nav drawer with back navigation
 *  - `CompactOfflineIndicator` — offline-state pill in the header
 *  - `SyncIndicator` — syncing/error indicator in the header
 *  - `RefreshIndicator` — refreshing spinner in the header
 *  - `FilterTriggerButton` — opens the FilterPanel
 *  - `FilterPanel` — slide-over panel with search + sort controls
 *  - `TabBar` — pending/completed (and section A/B for combined) tabs
 *  - `DogCard` — the per-entry card primitive that SortableEntryCard
 *    wraps with drag affordances
 *  - `ClassDetailsPopover` — hover/tap popover for class metadata
 *  - `ErrorState` — fetch-error fallback UI
 *  - `PullToRefresh` — pull-to-refresh gesture wrapper (currently
 *    disabled — pass-through wrapper)
 *
 * Utilities the page tree also reaches for that are not components
 * (likely a separate `EntryListUtilitySlots` bag in E2d-2):
 *  - `formatTrialDate(date: string): string`
 *  - `formatTimeForDisplay(seconds: number): string`
 *  - `haptic.medium(): void` (from @myk9/scoring-ui — may be addable
 *    as a ringside peer dep instead of slotting)
 *
 * @see PR E2d-2 — actual page move + this contract's resolution
 */
export type EntryListLayoutSlots = {
  /**
   * Placeholder — E2d-2 will replace `unknown` with concrete
   * `ComponentType<...Props>` and utility function types. Until then
   * this field accepts anything so the shape can be referenced
   * downstream without forcing premature type decisions.
   */
  readonly _todoE2d2: unknown;
};

// =============================================================================
// EntryListUiState / EntryListUiActions — shim-owned local state
// =============================================================================

/**
 * Snapshot of every `useState` slot the EntryList page tree currently
 * holds locally in apps/myk9q. After E2d-2, this state lives in the
 * host shim — the ringside page renders from these values and calls
 * the matching setter in `EntryListUiActions` to mutate.
 *
 * Field count: 19. The wide shape is deliberate — collapsing into a
 * `useReducer` would hide the per-slot ownership at the cost of
 * discoverability. The shim's useState ladder mirrors what's already
 * in `apps/myk9q/src/pages/EntryList/EntryList.tsx` lines 70-107
 * today, so reviewers can compare side-by-side during the move.
 *
 * Not all 19 slots are used by both pages — `CombinedEntryList`
 * doesn't surface `ClassOptionsDialog`, `MaxTimeDialog`, etc., so its
 * own props bag (`CombinedEntryListPageProps` below) takes a subset.
 * Keeping a single union here would force the combined page to accept
 * always-false flags, which fights the type checker more than it
 * helps; the two pages get their own UI state shapes instead.
 */
export interface EntryListUiState {
  // Entry data (mirrored from useEntryListData → setLocalEntries
  // because the page applies optimistic updates locally before the
  // refresh round-trip)
  localEntries: Entry[];
  manualOrder: Entry[];

  // Status popup (per-entry checkin status picker)
  activeStatusPopup: number | null;

  // Refresh / loading
  isManualRefreshing: boolean;
  isLoaded: boolean;
  hasCompletedInitialLoad: boolean;

  // Drag mode
  isDragMode: boolean;

  // Dialog open/close flags
  runOrderDialogOpen: boolean;
  classOptionsDialogOpen: boolean;
  requirementsDialogOpen: boolean;
  maxTimeDialogOpen: boolean;
  maxTimeRequiredWarning: boolean;
  settingsDialogOpen: boolean;
  noStatsDialogOpen: boolean;
  statusDialogOpen: boolean;
  selfCheckinDisabledDialog: boolean;
  showSuccessMessage: boolean;
  areaCountDialogOpen: boolean;

  // Area count requirements (loaded from class_requirements when
  // auto-opening the dialog; null until then)
  areaCountRequirements: { min: number; max: number; maxTotalSeconds: number } | null;

  // Filter panel
  isFilterPanelOpen: boolean;

  // Placement recalc spinner
  isRecalculatingPlacements: boolean;

  // Print dialog routing — null = closed, else which report to print
  printDialogType: 'check-in' | 'results' | 'scoresheet' | null;

  // Reset menu / confirm dialog
  activeResetMenu: number | null;
  resetMenuPosition: { top: number; left: number } | null;
  resetConfirmDialog: { show: boolean; entry: Entry | null };
}

/**
 * Setters paired 1:1 with `EntryListUiState`. The shim creates these
 * via useState and forwards both halves into the ringside page.
 *
 * The setter for `localEntries` is `Dispatch<SetStateAction<Entry[]>>`
 * (not `(entries: Entry[]) => void`) because the host's handlers use
 * the functional-update form heavily — `setLocalEntries(prev => ...)`
 * — for race-safe optimistic updates. Narrowing it would force the
 * shim to wrap every functional update.
 */
export interface EntryListUiActions {
  setLocalEntries: Dispatch<SetStateAction<Entry[]>>;
  setManualOrder: Dispatch<SetStateAction<Entry[]>>;

  setActiveStatusPopup: Dispatch<SetStateAction<number | null>>;

  setIsManualRefreshing: Dispatch<SetStateAction<boolean>>;
  setIsLoaded: Dispatch<SetStateAction<boolean>>;
  setHasCompletedInitialLoad: Dispatch<SetStateAction<boolean>>;

  setIsDragMode: Dispatch<SetStateAction<boolean>>;

  setRunOrderDialogOpen: Dispatch<SetStateAction<boolean>>;
  setClassOptionsDialogOpen: Dispatch<SetStateAction<boolean>>;
  setRequirementsDialogOpen: Dispatch<SetStateAction<boolean>>;
  setMaxTimeDialogOpen: Dispatch<SetStateAction<boolean>>;
  setMaxTimeRequiredWarning: Dispatch<SetStateAction<boolean>>;
  setSettingsDialogOpen: Dispatch<SetStateAction<boolean>>;
  setNoStatsDialogOpen: Dispatch<SetStateAction<boolean>>;
  setStatusDialogOpen: Dispatch<SetStateAction<boolean>>;
  setSelfCheckinDisabledDialog: Dispatch<SetStateAction<boolean>>;
  setShowSuccessMessage: Dispatch<SetStateAction<boolean>>;
  setAreaCountDialogOpen: Dispatch<SetStateAction<boolean>>;
  setAreaCountRequirements: Dispatch<
    SetStateAction<{ min: number; max: number; maxTotalSeconds: number } | null>
  >;

  setIsFilterPanelOpen: Dispatch<SetStateAction<boolean>>;

  setIsRecalculatingPlacements: Dispatch<SetStateAction<boolean>>;

  setPrintDialogType: Dispatch<SetStateAction<'check-in' | 'results' | 'scoresheet' | null>>;

  setActiveResetMenu: Dispatch<SetStateAction<number | null>>;
  setResetMenuPosition: Dispatch<SetStateAction<{ top: number; left: number } | null>>;
  setResetConfirmDialog: Dispatch<SetStateAction<{ show: boolean; entry: Entry | null }>>;

  // Filter hook state — owned by useEntryListFilters but exposed as
  // setters here because the handlers in useEntryListHandlers need to
  // call them (e.g. handleApplyRunOrder forces sortOrder = 'run').
  setActiveTab: (tab: TabType) => void;
  setSortOrder: (sort: SortType) => void;
}

// =============================================================================
// EntryListPageProps — single-class page
// =============================================================================

/**
 * Props the ringside `EntryListPage` (PR E2d-2) will consume.
 *
 * Read as: "the host shim hands the page a complete render description.
 * The page calls no hooks, owns no state, makes no external calls."
 *
 * Grouped into bags rather than flattened to keep the prop count
 * manageable and to make the host shim's render call read as:
 *   <RingsideEntryListPage
 *     data={...}
 *     handlers={...}
 *     actions={...}
 *     uiState={...}
 *     uiActions={...}
 *     dialogs={...}
 *     layout={...}
 *     context={{ classId, role, ... }}
 *   />
 */
export interface EntryListPageProps {
  /** Route param: classId from `/class/:classId/entries`. */
  classId: string | undefined;

  /** Data + class info from `useEntryListData`. */
  data: EntryListData;

  /** Loading/error flags + refresh function from `useEntryListData`. */
  dataStatus: {
    isRefreshing: boolean;
    fetchError: Error | null;
    refresh: (forceSync?: boolean) => Promise<void>;
  };

  /** Action handler bag from host's `useEntryListHandlers`. */
  handlers: EntryListHandlers;

  /** Mutation bag from host's `useEntryListActions`. */
  actions: EntryListActions;

  /** Page-local UI state (snapshot). Shim owns the useState. */
  uiState: EntryListUiState;
  /** Setters paired with `uiState`. */
  uiActions: EntryListUiActions;

  /** Host-injected dialog components — see PR E2c. */
  dialogs: EntryListDialogSlots;

  /** Host-injected UI primitives — see TODO marker above. */
  layout: EntryListLayoutSlots;

  /**
   * Permission + context helpers the page reads. The shim builds this
   * from its auth context — ringside doesn't reach for `useAuth` /
   * `usePermission` directly.
   */
  context: {
    /** Currently authenticated role identifier (or null when unauthenticated). */
    role: string | null;
    /** Show metadata the page reads for org-specific behavior. */
    showContext: { org?: string; competition_type?: string } | null;
    /** Permission checker — flattened so ringside doesn't see the host's helper hook. */
    hasPermission: (
      permission:
        | 'canScore'
        | 'canCheckInDogs'
        | 'canChangeRunOrder'
        | 'canManageClasses',
    ) => boolean;
  };
}

// =============================================================================
// CombinedEntryListPageProps — combined A/B page
// =============================================================================

/**
 * Props for the combined-class view at
 * `/class/:classIdA/:classIdB/entries/combined`.
 *
 * Why a separate bag rather than reusing `EntryListPageProps`?
 * ------------------------------------------------------------
 * The combined page has a meaningfully different shape from the
 * single-class page:
 *  - Different sort modes (adds `'section-armband'` to the union)
 *  - Different print dialog state (per-section variants:
 *    `'check-in' | 'results-a' | 'results-b' | 'scoresheet-a' | 'scoresheet-b'`)
 *  - No class-options menu, no max-time/requirements/settings/status
 *    dialogs, no area count, no max-time warning, no recalc-placements
 *  - Adds section filter (`'all' | 'A' | 'B'`)
 *  - Uses a different "handlers" shape that comes from
 *    `useEntryHandlers` in CombinedEntryList.helpers.ts rather than
 *    `useEntryListHandlers`
 *
 * Unifying them would force `EntryListPageProps` to have ~20 optional
 * fields and the page itself to conditionally branch on view mode,
 * which is worse than two focused interfaces. Both interfaces share
 * `EntryListActions`, the layout slot bag, and a subset of dialog
 * slots — that's where the reuse lives.
 *
 * E2d-2 will refine this further as the combined-page move details
 * come into focus.
 */
export interface CombinedEntryListPageProps {
  /** Route params: classIdA + classIdB from the combined route. */
  classIds: { a: string | undefined; b: string | undefined };

  /** Data + class info from `useEntryListData` (combined-class variant). */
  data: EntryListData;

  /** Loading/error flags + refresh function. */
  dataStatus: {
    isRefreshing: boolean;
    fetchError: Error | null;
    refresh: (forceSync?: boolean) => Promise<void>;
  };

  /** Mutation bag from host's `useEntryListActions` (same as single-class). */
  actions: EntryListActions;

  /**
   * Combined-page handlers from the host's `useEntryHandlers`
   * (defined in CombinedEntryList.helpers.ts). Smaller than
   * `EntryListHandlers` — just status / reset / menu — because the
   * combined page doesn't surface class-level options or print
   * orchestration through the same hook. Print is dispatched via
   * `dispatchPrintAction` and `applyRunOrderPresetScoped` is called
   * inline in CombinedEntryList.tsx today.
   *
   * Empirically typed below; E2d-2 will move the helper into ringside
   * and may tighten or restructure this.
   */
  combinedHandlers: CombinedEntryHandlers;

  /** Page-local UI state (snapshot). Shim owns the useState. */
  uiState: CombinedEntryListUiState;
  /** Setters paired with `uiState`. */
  uiActions: CombinedEntryListUiActions;

  /**
   * Subset of dialog slots actually rendered by the combined page.
   * Forces the type-checker to point out if a future change tries to
   * render a dialog the combined page doesn't take.
   */
  dialogs: Pick<
    EntryListDialogSlots,
    'CheckinStatusDialog' | 'RunOrderDialog' | 'ScoresheetPrintDialog'
  >;

  /** Host-injected UI primitives — same TODO as the single-class page. */
  layout: EntryListLayoutSlots;

  /** Permission + context helpers (same shape as single-class). */
  context: EntryListPageProps['context'];

  /**
   * Combined-view print dispatcher. Wraps the host's
   * `dispatchPrintAction(type, sortOrder, classInfo, orgString, entries)`
   * so the ringside page can call it without knowing about
   * reportService. The shim binds the host fn and partials in
   * `classInfo` and `orgString` from its own props.
   */
  onPrintSortOrder: (
    type: 'check-in' | 'results-a' | 'results-b' | 'scoresheet-a' | 'scoresheet-b' | null,
    sortOrder: 'run-order' | 'armband' | 'placement',
  ) => void;

  /**
   * Combined-view run-order applier. Wraps the host's
   * `applyRunOrderPresetScoped(localEntries, preset, scope, renumberMode)`
   * so ringside doesn't import runOrderService.
   */
  onApplyRunOrder: (
    preset: import('./dialogSlots').RunOrderPreset,
    scope?: import('./dialogSlots').RunOrderScope,
    renumberMode?: import('./dialogSlots').RenumberMode,
  ) => Promise<void>;

  /**
   * Combined-view scoresheet navigation. Wraps the host's
   * `getScoresheetNavigationRoute(orgString, entry)`. Returns the
   * route string the page should push, or null when no route applies.
   */
  getScoresheetNavigationRoute: (entry: Entry) => string | null;
}

/**
 * Handler bag returned by the host's `useEntryHandlers` (from
 * `CombinedEntryList.helpers.ts`). Smaller than `EntryListHandlers`
 * because the combined view's interactions are narrower.
 */
export interface CombinedEntryHandlers {
  activeStatusPopup: number | null;
  setActiveStatusPopup: Dispatch<SetStateAction<number | null>>;

  handleStatusClick: (e: import('react').MouseEvent, entryId: number) => void;
  handleStatusChange: (
    entryId: number,
    newStatus:
      | 'no-status'
      | 'checked-in'
      | 'conflict'
      | 'pulled'
      | 'at-gate'
      | 'come-to-gate'
      | 'in-ring'
      | 'completed',
  ) => Promise<void>;

  activeResetMenu: number | null;
  resetMenuPosition: { top: number; left: number } | null;
  handleResetMenuClick: (e: import('react').MouseEvent, entryId: number) => void;
  handleResetScore: (entry: Entry) => void;

  resetConfirmDialog: { show: boolean; entry: Entry | null };
  confirmResetScore: () => Promise<void>;
  cancelResetScore: () => void;
  closeResetMenu: () => void;
}

/**
 * Combined-page UI state (subset / variant of `EntryListUiState`).
 * Different sort union, different print dialog state, no class-options
 * cascade.
 */
export interface CombinedEntryListUiState {
  localEntries: Entry[];
  sortOrder: SortOrder; // includes 'section-armband'
  isLoaded: boolean;
  isFilterPanelOpen: boolean;
  runOrderDialogOpen: boolean;
  showSuccessMessage: boolean;
  isDragMode: boolean;
  selfCheckinDisabledDialog: boolean;
  /** Per-section print dialog state (`'results-a'`, `'scoresheet-b'`, etc.). */
  printDialogState: PrintDialogState;
}

export interface CombinedEntryListUiActions {
  setLocalEntries: Dispatch<SetStateAction<Entry[]>>;
  setManualOrder: Dispatch<SetStateAction<Entry[]>>;
  setSortOrder: Dispatch<SetStateAction<SortOrder>>;
  setIsLoaded: Dispatch<SetStateAction<boolean>>;
  setIsFilterPanelOpen: Dispatch<SetStateAction<boolean>>;
  setRunOrderDialogOpen: Dispatch<SetStateAction<boolean>>;
  setShowSuccessMessage: Dispatch<SetStateAction<boolean>>;
  setIsDragMode: Dispatch<SetStateAction<boolean>>;
  setSelfCheckinDisabledDialog: Dispatch<SetStateAction<boolean>>;
  setPrintDialogState: Dispatch<SetStateAction<PrintDialogState>>;

  setActiveTab: (tab: 'pending' | 'completed') => void;
  setSearchTerm: (term: string) => void;
  setSectionFilter: (filter: 'all' | 'A' | 'B') => void;
}

// Re-export ClassInfo for downstream consumers building these bags
// (kept here so the host shim can `import { ..., ClassInfo } from
// '@myk9/ringside'` in one statement when assembling props).
export type { ClassInfo };
