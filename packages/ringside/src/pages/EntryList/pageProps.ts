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

import type {
  ComponentType,
  Dispatch,
  MutableRefObject,
  ReactNode,
  RefObject,
  SetStateAction,
} from 'react';
import type { Entry } from '../../stores/entryStore';
import type { EntryListData, ClassInfo, SortOrder, PrintDialogState } from './types';
import type { EntryListDialogSlots } from './dialogSlots';
import type { EntryListHandlers, EntryListActions } from './hookContracts';
import type { TabType, SortType } from './hooks/useEntryListFilters';

// =============================================================================
// EntryListLayoutSlots — UI primitive slots the host injects (PR E2d-2a)
// =============================================================================
//
// Mirrors the EntryListDialogSlots pattern from PR E2c: every host UI
// primitive the page tree currently imports directly from apps/myk9q
// is re-expressed here as an opaque `ComponentType<Props>`. The host
// keeps the component physically; ringside renders the slot.
//
// Two intentional non-slots:
//
//  1. `TabBar` / `Tab` — live in `@myk9/ui`, which is already a
//     ringside dependency. Moved files can import directly from there.
//
//  2. `formatTrialDate`, `formatTimeForDisplay` — re-exports from
//     `@myk9/core`, also already a ringside dep. Moved files import
//     directly; no `EntryListUtilitySlots` bag needed.
//
// `haptic` (from `@myk9/scoring-ui`) is still TBD — `SortableEntryCard`
// will encounter that decision in E2d-2b. Not slotted here yet.

/**
 * Status-border variant the page can request from `DogCard`. The card
 * paints a colored stroke around the tile to communicate entry state
 * (check-in status, in-ring, placement, qualifying result, etc.).
 *
 * Matches the host's `DogCard` union literally. Inlined here rather
 * than re-exported from `@myk9/ui` because the union is the contract
 * between the EntryList page (which decides which variant fits the
 * entry's state) and the card primitive — it shouldn't drift independently
 * of the page.
 */
export type DogCardStatusBorder =
  | 'no-status'
  | 'checked-in'
  | 'conflict'
  | 'pulled'
  | 'at-gate'
  | 'come-to-gate'
  | 'in-ring'
  | 'completed'
  | 'scored'
  | 'placement-1'
  | 'placement-2'
  | 'placement-3'
  | 'result-qualified'
  | 'result-nq'
  | 'result-ex'
  | 'result-abs'
  | 'result-wd';

/**
 * Page identifier the hamburger menu uses to highlight the active
 * section. Mirrors the host's union — kept narrow so a stale value
 * surfaces at compile time when adding a new top-level page in the
 * host. The page tree always passes `'entries'`; the slot accepts the
 * full union for hosts reusing the primitive elsewhere.
 */
export type HamburgerMenuPage =
  | 'home'
  | 'announcements'
  | 'settings'
  | 'stats'
  | 'entries'
  | 'tv'
  | 'show'
  | 'results';

/** Edge a popover anchors against. Inlined from the host's `Popover`. */
export type PopoverPosition = 'top' | 'bottom' | 'left' | 'right';

/**
 * Pull-to-refresh gesture phase. Reported back to the host's
 * `renderIndicator` callback so it can swap copy/animation per phase.
 */
export type PullToRefreshState = 'idle' | 'pulling' | 'ready' | 'refreshing' | 'complete';

/**
 * Sync status the indicator pill renders. The page derives it from
 * `EntryListActions.{isSyncing,hasError}` plus the network state it
 * already tracks.
 */
export type SyncIndicatorStatus = 'synced' | 'syncing' | 'offline' | 'error';

/**
 * Sort-option descriptor for the filter panel. The page builds the
 * options array; the panel renders it as a radio-group.
 */
export interface FilterPanelSortOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

// =============================================================================
// Per-primitive Props interfaces
// =============================================================================
//
// Co-located here for the same reason EntryListDialogSlots co-locates
// its dialog Props: ringside owns the contract, host components must
// conform. apps/myk9q will switch each primitive's local interface to
// `Props from @myk9/ringside` during/after E2d-2b.

/** Top-left nav drawer with optional "← Back to X" affordance. */
export interface HamburgerMenuProps {
  backNavigation?: { label: string; action: () => void };
  currentPage?: HamburgerMenuPage;
  className?: string;
}

/**
 * Compact "offline" pill in the header. Wraps the host's
 * SyncStatusPopover internally — ringside doesn't need to know about
 * the popover.
 */
export interface CompactOfflineIndicatorProps {
  className?: string;
}

/** Bigger sync indicator with retry affordance. */
export interface SyncIndicatorProps {
  status: SyncIndicatorStatus;
  pendingCount?: number;
  errorMessage?: string;
  onRetry?: () => void;
  compact?: boolean;
}

/** Refresh spinner. Rendered above or below the list during pull-refresh. */
export interface RefreshIndicatorProps {
  isRefreshing: boolean;
  position?: 'top' | 'bottom';
  message?: string;
  className?: string;
}

/** Button that opens the FilterPanel. Shows an active-filter count badge. */
export interface FilterTriggerButtonProps {
  onClick: () => void;
  hasActiveFilters?: boolean;
  activeFilterCount?: number;
  className?: string;
}

/** Fetch-error fallback UI. */
export interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  className?: string;
}

/**
 * Pull-to-refresh wrapper. The host implementation handles the
 * gesture; ringside just renders its children inside it.
 */
export interface PullToRefreshProps {
  children: ReactNode;
  onRefresh: () => Promise<void>;
  threshold?: number;
  maxPullDistance?: number;
  enabled?: boolean;
  renderIndicator?: (state: PullToRefreshState) => ReactNode;
  className?: string;
}

/** Slide-over panel with search + sort controls. */
export interface FilterPanelProps {
  isOpen: boolean;
  onClose: () => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  searchPlaceholder?: string;
  sortOptions: FilterPanelSortOption[];
  sortOrder: string;
  onSortChange: (order: string) => void;
  resultsLabel?: string;
  title?: string;
  children?: ReactNode;
}

/**
 * Per-entry card primitive. SortableEntryCard wraps this with drag
 * affordances + status badges. The page never renders `DogCard`
 * directly — only through `SortableEntryCard`.
 */
export interface DogCardProps {
  armband: number;
  callName: string;
  breed: string;
  handler: string;
  onClick?: () => void;
  className?: string;
  statusBorder?: DogCardStatusBorder;
  actionButton?: ReactNode;
  favoriteButton?: ReactNode;
  resultBadges?: ReactNode;
  sectionBadge?: 'A' | 'B' | null;
  onPrefetch?: () => void;
  dragHandle?: ReactNode;
}

/**
 * Read-only "class details" popover anchored to the header info icon.
 * Surfaces judge name(s), entry counts, time limits, area count, and
 * the current visibility preset.
 *
 * `data` is a structural bag rather than a full class row so ringside
 * doesn't see host-only fields (license_key, replication metadata, etc).
 */
export interface ClassDetailsData {
  classId?: number | string;
  status?: string;
  totalEntries?: number;
  completedEntries?: number;
  judgeName?: string;
  judgeNameB?: string;
  timeLimitSeconds?: number;
  timeLimitArea2Seconds?: number;
  timeLimitArea3Seconds?: number;
  areaCount?: number;
  visibilityPreset?: 'open' | 'standard' | 'review';
  selfCheckinEnabled?: boolean;
}

export interface ClassDetailsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Ref to the element the popover should anchor against. Typed
   * permissively (`HTMLElement | null`) because the host's primitive
   * accepts the same — narrowing here would force the shim to cast.
   */
  anchorRef: RefObject<HTMLElement | null>;
  data: ClassDetailsData;
  position?: PopoverPosition;
  showJudgeB?: boolean;
}

// =============================================================================
// The slot interface
// =============================================================================

/**
 * Host-injected UI primitives. Mirrors EntryListDialogSlots in shape:
 * flat bag of `ComponentType<Props>` slots, host owns the
 * implementation, ringside owns the contract.
 *
 * All slots are required — the page renders every one of them during
 * normal use. There's no analogue of `AreaCountSelectionDialog`'s
 * conditional rendering in this bag.
 *
 * What's NOT here (deliberately):
 *  - `TabBar` / `Tab` — direct import from `@myk9/ui`
 *  - `formatTrialDate`, `formatTimeForDisplay` — direct import from `@myk9/core`
 *  - `haptic.medium()` — decision deferred to E2d-2b (the consumer is
 *    `SortableEntryCard`, which lands in 2b)
 */
export interface EntryListLayoutSlots {
  // Header chrome
  HamburgerMenu: ComponentType<HamburgerMenuProps>;
  CompactOfflineIndicator: ComponentType<CompactOfflineIndicatorProps>;
  SyncIndicator: ComponentType<SyncIndicatorProps>;
  RefreshIndicator: ComponentType<RefreshIndicatorProps>;

  // Filter + search
  FilterTriggerButton: ComponentType<FilterTriggerButtonProps>;
  FilterPanel: ComponentType<FilterPanelProps>;

  // List body
  DogCard: ComponentType<DogCardProps>;
  PullToRefresh: ComponentType<PullToRefreshProps>;
  ErrorState: ComponentType<ErrorStateProps>;

  // Class-info popover (header info icon)
  ClassDetailsPopover: ComponentType<ClassDetailsPopoverProps>;
}

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
  activeStatusPopup: string | null;

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
  activeResetMenu: string | null;
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

  setActiveStatusPopup: Dispatch<SetStateAction<string | null>>;

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

  setActiveResetMenu: Dispatch<SetStateAction<string | null>>;
  setResetMenuPosition: Dispatch<SetStateAction<{ top: number; left: number } | null>>;
  setResetConfirmDialog: Dispatch<SetStateAction<{ show: boolean; entry: Entry | null }>>;

  // Filter hook state — owned by useEntryListFilters but exposed as
  // setters here because the handlers in useEntryListHandlers need to
  // call them (e.g. handleApplyRunOrder forces sortOrder = 'run').
  setActiveTab: (tab: TabType) => void;
  setSortOrder: (sort: SortType) => void;
  setSearchTerm: (term: string) => void;
}

// =============================================================================
// EntryListDerived — read-only derived data from useEntryListFilters
// =============================================================================

/**
 * Read-only derived data the shim's `useEntryListFilters` call
 * produces. Threaded into the page so it doesn't re-call the hook
 * (single source of truth for filter state + derivations).
 *
 * Why a separate bag rather than mixed into uiState?
 * --------------------------------------------------
 * `uiState` is paired 1:1 with `uiActions` setters. This bag is
 * derived data — there's no setter for `pendingEntries` because it's
 * computed from `localEntries + filter inputs`. Separating keeps the
 * mental model clear: uiState is what you store, derived is what you
 * compute.
 *
 * Path A architecture (locked in PR E2d-2b)
 * -----------------------------------------
 * Shim calls `useEntryListFilters` (pure ringside hook), threads both
 * setters (into `uiActions`) and derived values (here) into the page.
 * Page renders. The page does NOT call the filter hook itself, so the
 * shim's `useEntryListHandlers` invocation has access to the filter
 * setters it needs as deps.
 */
export interface EntryListDerived {
  /** Current active tab — pending or completed entries. */
  activeTab: TabType;
  /** Current sort order. */
  sortOrder: SortType;
  /** Current search term filtering visible entries. */
  searchTerm: string;
  /**
   * Entries after applying search + sort. Tab-agnostic — the page
   * splits this into `pendingEntries` / `completedEntries`.
   */
  filteredEntries: Entry[];
  /** Filtered entries with `isScored === false`. */
  pendingEntries: Entry[];
  /** Filtered entries with `isScored === true`. */
  completedEntries: Entry[];
  /** Pending or completed depending on `activeTab`. */
  currentEntries: Entry[];
  /**
   * Counts from the unfiltered `localEntries` array (NOT
   * `filteredEntries`). Used by the tab badges so the inactive tab
   * still shows its actual count when a search filter is applied to
   * the active tab.
   */
  entryCounts: { pending: number; completed: number };
}

/**
 * Drag-and-drop state from the shim's `useDragAndDropEntries` call.
 * Same Path A rationale as `EntryListDerived` — pure ringside hook
 * owned by the shim so the resulting handlers can be threaded into
 * the page consistently.
 */
export interface EntryListDrag {
  sensors: import('@dnd-kit/core').SensorDescriptor<import('@dnd-kit/core').SensorOptions>[];
  handleDragStart: (event: import('@dnd-kit/core').DragStartEvent) => void;
  handleDragEnd: (event: import('@dnd-kit/core').DragEndEvent) => Promise<void>;
  /**
   * Ref the data + effects hooks read to suppress sync-driven state
   * resets during a drag. Mutated by `useDragAndDropEntries` (start
   * → true, end → false). The shim owns the ref and passes the same
   * instance to `useEntryListData`, `useEntryListEffects`, and the
   * page (which threads it into its drag hook).
   */
  isDraggingRef: MutableRefObject<boolean>;
}

export interface EntryListFavorites {
  favoriteArmbands: ReadonlySet<number>;
  onToggleFavoriteArmband: (armband: number) => void;
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

  /** Derived data + filter state from the shim's `useEntryListFilters` call. */
  derived: EntryListDerived;

  /** Optional exhibitor dog-favorite state for notification fanout. */
  favorites?: EntryListFavorites;

  /** Drag-and-drop sensors + handlers from the shim's `useDragAndDropEntries` call. */
  drag: EntryListDrag;

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
      permission: 'canScore' | 'canCheckInDogs' | 'canChangeRunOrder' | 'canManageClasses'
    ) => boolean;
    /**
     * Precomputed by the shim from
     * `hasRuleDefinedMaxTimes(parseOrganizationData(showContext.org)) || !canModifyClassSettings`.
     * True means the ClassOptionsDialog should hide the "Set Max Time"
     * option (org rule fixes max times, or user lacks permission).
     */
    hideMaxTimeOption: boolean;
    /**
     * Precomputed by the shim from `!hasRole(['admin', 'judge'])`.
     * True means the ClassOptionsDialog should hide the "Settings"
     * option.
     */
    hideSettingsOption: boolean;
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
   * Derived data + filter state from the shim's `useEntryListFilters`
   * call (combined-view variant — includes section filter).
   */
  derived: CombinedEntryListDerived;

  /** Optional exhibitor dog-favorite state for notification fanout. */
  favorites?: EntryListFavorites;

  /** Drag-and-drop state from the shim's `useDragAndDropEntries` call. */
  drag: EntryListDrag;

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
    sortOrder: 'run-order' | 'armband' | 'placement'
  ) => void;

  /**
   * Combined-view run-order applier. Wraps the host's
   * `applyRunOrderPresetScoped(localEntries, preset, scope, renumberMode)`
   * so ringside doesn't import runOrderService.
   */
  onApplyRunOrder: (
    preset: import('./dialogSlots').RunOrderPreset,
    scope?: import('./dialogSlots').RunOrderScope,
    renumberMode?: import('./dialogSlots').RenumberMode
  ) => Promise<void>;

  /**
   * Combined-view scoresheet navigation. Wraps the host's
   * `getScoresheetNavigationRoute(orgString, entry)`. Returns the
   * route string the page should push, or null when no route applies.
   */
  getScoresheetNavigationRoute: (entry: Entry) => string | null;

  /**
   * Per-entry scoresheet prefetch. Wraps the host's
   * `usePrefetch().prefetch(...)` + `preloadScoresheetByType(...)` +
   * `getScoresheetRoute(...)` for a single entry. The page calls this
   * once for the focused entry and then again for the next 1-2
   * pending entries (lookahead loop runs in the page).
   *
   * No-ops when the entry is scored, has no route, or the host's
   * scoresheet router declines.
   */
  onPrefetchScoresheet: (entry: Entry) => void;
}

/**
 * Handler bag returned by the host's `useEntryHandlers` (from
 * `CombinedEntryList.helpers.ts`). Smaller than `EntryListHandlers`
 * because the combined view's interactions are narrower.
 */
export interface CombinedEntryHandlers {
  activeStatusPopup: string | null;
  setActiveStatusPopup: Dispatch<SetStateAction<string | null>>;

  handleStatusClick: (e: import('react').MouseEvent, entryId: string) => void;
  handleStatusChange: (
    entryId: string,
    newStatus:
      | 'no-status'
      | 'checked-in'
      | 'conflict'
      | 'pulled'
      | 'at-gate'
      | 'come-to-gate'
      | 'in-ring'
      | 'completed'
  ) => Promise<void>;

  activeResetMenu: string | null;
  resetMenuPosition: { top: number; left: number } | null;
  handleResetMenuClick: (e: import('react').MouseEvent, entryId: string) => void;
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

/**
 * Combined-page derived data. Wider than `EntryListDerived` —
 * includes the section filter (`'all' | 'A' | 'B'`) and the
 * per-section tab counts. `sortedEntries` is exposed because the
 * combined page applies its own custom comparator
 * (`compareEntries(a, b, sortOrder)`) downstream of the filter hook;
 * the shim computes this once and threads it in.
 */
export interface CombinedEntryListDerived {
  activeTab: 'pending' | 'completed';
  searchTerm: string;
  sectionFilter: 'all' | 'A' | 'B';
  /** Entries after search + section filter, before custom sort. */
  filteredEntries: Entry[];
  /** `filteredEntries` after `compareEntries(a, b, sortOrder)`. */
  sortedEntries: Entry[];
  /** Sorted entries with `isScored === false`. */
  pendingEntries: Entry[];
  /** Sorted entries with `isScored === true`. */
  completedEntries: Entry[];
  /** Pending or completed depending on `activeTab`. */
  currentEntries: Entry[];
  /** Counts derived from `localEntries`. */
  entryCounts: { pending: number; completed: number };
}

// Re-export ClassInfo for downstream consumers building these bags
// (kept here so the host shim can `import { ..., ClassInfo } from
// '@myk9/ringside'` in one statement when assembling props).
export type { ClassInfo };
