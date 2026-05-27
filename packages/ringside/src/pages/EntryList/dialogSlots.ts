/**
 * EntryListDialogSlots — host-injected dialog components for the
 * EntryList page tree (PR E2c).
 *
 * Design note — A1 architecture (Maximal slot-injection)
 * -------------------------------------------------------
 * The EntryList page in ringside renders ten distinct dialogs. Four of
 * those dialogs do their own Supabase queries internally (class
 * requirements, settings, area-count selection, max-time configuration);
 * the other six are pure-UI dialogs that take props and callbacks.
 *
 * Rather than try to extract the Supabase calls out of the
 * data-coupled dialogs (which would force the supabase client itself
 * into ringside's DI surface), this PR ships ALL TEN dialogs as opaque
 * `React.ComponentType<Props>` slots. The host (apps/myk9q today;
 * apps/myk9show's `/at-show` route in Phase 1) keeps the components
 * physically — supabase calls stay inside the host's implementations
 * — and passes the components by reference into ringside's page via
 * this interface.
 *
 * Direct-arg DI, not context
 * --------------------------
 * Matches the pattern established by PR E1d (`StatusDependencies`) and
 * PR E2b (`EntryListDataDependencies`): host passes a typed bag of
 * dependencies into the ringside hook/page. The provider context
 * defined in PR E0.5 (`RingsideProvider`) remains unmounted by any
 * host and is not extended by this PR.
 *
 * Inversion of ownership
 * ----------------------
 * Before this PR, each app-side dialog owned its own `*DialogProps`
 * interface. After this PR ships AND E2d wires the ringside page into
 * apps/myk9q, the contract direction flips: ringside owns the prop
 * shape, host components must conform. apps/myk9q's dialog
 * implementations will import their prop types from `@myk9/ringside`
 * during E2d. This file is the single source of truth for the contract
 * shape going forward.
 */

import type { ComponentType } from 'react';
import type { EntryStatus } from '@myk9/core';
import type { Entry } from '../../stores/entryStore';

// =============================================================================
// Supporting types — co-located here so the slot interface is self-contained.
// =============================================================================

/**
 * Run-order preset choices for `RunOrderDialog`. Matches the eight
 * presets the apps/myk9q dialog renders. New presets land here first,
 * then the host renders them.
 */
export type RunOrderPreset =
  | 'a-then-b-asc'
  | 'a-then-b-desc'
  | 'b-then-a-asc'
  | 'b-then-a-desc'
  | 'combined-asc'
  | 'combined-desc'
  | 'random-all'
  | 'random-sections';

/** Section scope a run-order preset applies to. `'all'` ignores sections. */
export type RunOrderScope = 'all' | 'A' | 'B';

/**
 * What happens to existing exhibitor-order numbers when a preset is
 * applied to a subset of entries.
 *
 *  - `'preserve'`: keep the other section's numbers untouched
 *  - `'renumber'`: re-sequence the whole class so numbers run 1..N
 */
export type RenumberMode = 'preserve' | 'renumber';

/**
 * Sort orders the print dialog can request. The host's print pipeline
 * (PDF generation) decides what each means.
 */
export type PrintSortOrder = 'run-order' | 'armband' | 'placement';

/**
 * Re-export of the canonical check-in status from `@myk9/core`. The
 * apps/myk9q dialog used a locally-defined `CheckinStatus` with the
 * same eight values — this collapses to the single source of truth.
 */
export type CheckInStatus = EntryStatus;

/**
 * Min/max area count a class allows, plus the maximum total time budget
 * across all areas. Used by `AreaCountSelectionDialog` to constrain
 * input and validate the user's chosen allocation.
 */
export interface AreaCountRequirements {
  min: number;
  max: number;
  maxTotalSeconds: number;
}

/**
 * Class metadata bag passed into `ClassOptionsDialog`. Trimmed to the
 * fields the dialog actually reads — the host probably has a richer
 * Class type, but ringside only sees what it needs.
 */
export interface ClassOptionsData {
  id: number;
  element: string;
  level: string;
  class_name: string;
  entry_count?: number;
  completed_count?: number;
  class_status?: string;
  briefing_time?: string;
  break_until_time?: string;
  start_time?: string;
}

/**
 * Class metadata bag passed into `MaxTimeDialog`. Includes the
 * per-area time limits in seconds and the optional paired-class id
 * (for combined views that share time limits across two classes).
 */
export interface MaxTimeClassData {
  id: number;
  element: string;
  level: string;
  class_name: string;
  time_limit_seconds?: number;
  time_limit_area2_seconds?: number;
  time_limit_area3_seconds?: number;
  area_count?: number;
  pairedClassId?: number;
}

// =============================================================================
// Per-dialog Props interfaces — co-located with the slot definition.
// =============================================================================
//
// Each `*DialogProps` mirrors the interface currently exported from the
// matching apps/myk9q component, verified file-by-file in the E2d-aware
// audit that informed this PR. apps/myk9q will switch its imports to
// these definitions during E2d so the contract becomes single-sourced.

/**
 * Props for the run-order preset picker. Async `onApplyOrder` is
 * deliberate — the host's preset application calls the database and
 * the dialog should stay open until it completes (or fails).
 */
export interface RunOrderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  entries: Entry[];
  /** Apply the chosen preset. May reject; dialog handles error display. */
  onApplyOrder: (
    preset: RunOrderPreset,
    scope?: RunOrderScope,
    renumberMode?: RenumberMode,
  ) => Promise<void>;
  /** Switch the underlying view into drag-to-reorder mode. */
  onOpenDragMode: () => void;
}

/**
 * Props for setting a class's overall status (briefing, scoring,
 * break, completed). The `onMarkAbsent` callback is optional so this
 * slot can also be used in flows where the "mark unscored absent"
 * affordance isn't applicable.
 */
export interface ClassStatusDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onStatusChange: (status: string, timeValue?: string) => void;
  classData: {
    id: number;
    element: string;
    level: string;
    class_name: string;
    class_status: string;
    entry_count: number;
    scored_count?: number;
    briefing_time?: string;
    break_until_time?: string;
    start_time?: string;
  };
  currentStatus: string;
  /** Callback to mark all unscored entries as absent. */
  onMarkAbsent?: () => Promise<void>;
}

/**
 * Umbrella "class options" menu — gates the per-class affordances
 * (requirements, settings, status, statistics, print). Callbacks are
 * all optional; `hide*` flags suppress individual entries when the
 * host doesn't want them rendered.
 *
 * `onStatistics` can return `false` to indicate "don't close the
 * dialog yet" (used for the "no scores → show NoStatsDialog instead"
 * branch).
 */
export interface ClassOptionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  classData: ClassOptionsData | null;
  onRequirements?: () => void;
  onSetMaxTime?: () => void;
  onSettings?: () => void;
  onStatistics?: () => boolean | void;
  onStatus?: () => void;
  onPrintCheckIn?: () => void;
  onPrintResults?: () => void;
  onPrintScoresheet?: () => void;
  hideRequirements?: boolean;
  hideMaxTime?: boolean;
  hideSettings?: boolean;
  hideStatistics?: boolean;
  hideStatus?: boolean;
  hidePrintOptions?: boolean;
}

/**
 * Minimal two-option dialog: pick a sort order, fire `onPrint`. The
 * `options` prop lets callers override the default button labels
 * ("Run Order" / "Armband Number") for contexts like results sheets
 * where the choices are different.
 */
export interface ScoresheetPrintDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onPrint: (sortOrder: PrintSortOrder) => void;
  title?: string;
  /** Override the two button labels and sort values. */
  options?: {
    primary: { label: string; sortOrder: PrintSortOrder };
    secondary: { label: string; sortOrder: PrintSortOrder };
  };
}

/**
 * Forces selection of an area count (1, 2, or 3 depending on
 * `areaCountRequirements`) for flexible-area classes. Shown at page
 * init when the class allows multiple areas and none has been chosen
 * yet — blocks the entry list until completed.
 *
 * The host implementation in apps/myk9q writes the chosen area count
 * + per-area seconds directly to the `classes` table via Supabase;
 * `onSave` fires after that round-trip completes.
 */
export interface AreaCountSelectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  classData: {
    id: number;
    element: string;
    level: string;
    class_name: string;
  };
  areaCountRequirements: AreaCountRequirements;
  onSave: () => void;
}

/**
 * Per-dog check-in status picker. Used both by exhibitors (limited
 * status set) and stewards/judges (full status set including ring
 * management). The host's implementation reads `usePermission()` to
 * decide which options to show — ringside doesn't need to know.
 */
export interface CheckinStatusDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onStatusChange: (status: CheckInStatus) => void;
  dogInfo: {
    armband: number;
    callName: string;
    handler: string;
  };
  /** Render verbose explanations for each status option. */
  showDescriptions?: boolean;
  /** Show "In Ring" and "Completed" options (stewards/judges only). */
  showRingManagement?: boolean;
}

/**
 * Read-only display of a class's rules and requirements (hides,
 * distractions, height, area count, time type). The host
 * implementation fetches the requirements from Supabase internally.
 *
 * `onSetMaxTime` is optional — when present, the dialog can transition
 * the user to `MaxTimeDialog`.
 */
export interface ClassRequirementsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSetMaxTime?: () => void;
  classData: {
    id: number;
    element: string;
    level: string;
    class_name: string;
    time_limit?: string;
    time_limit2?: string;
    time_limit3?: string;
    entry_count: number;
  };
}

/**
 * Per-class settings (self check-in toggle, results visibility,
 * planned start time, area allocation). Host implementation reads
 * and writes the host-owned settings tables via Supabase.
 *
 * `onSettingsUpdate` fires after a successful save so the parent can
 * refresh anything that depends on the changed settings.
 */
export interface ClassSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  classData: {
    id: number;
    element: string;
    level: string;
    class_name: string;
    self_checkin_enabled?: boolean;
  };
  onSettingsUpdate?: () => void;
}

/**
 * Max-time configuration per area. Shows either dictated (fixed,
 * non-editable) times from the class's organization rules, or input
 * fields the judge fills in. `showWarning` highlights the dialog
 * (and changes copy) when scoring started without a max time set.
 */
export interface MaxTimeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  showWarning?: boolean;
  classData: MaxTimeClassData;
  /** Fires after a successful save; host refreshes derived state. */
  onTimeUpdate?: () => void;
}

/**
 * Tiny info dialog shown when the user requests statistics for a
 * class that has no scored entries yet. Pure presentational — no
 * callbacks beyond close.
 */
export interface NoStatsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Name of the class displayed in the dialog body. */
  className?: string;
}

// =============================================================================
// The slot interface
// =============================================================================

/**
 * Dialog slots the host injects into ringside's EntryList page.
 *
 * Required vs optional
 * --------------------
 * Nine of the ten slots are required. `AreaCountSelectionDialog` is
 * marked optional because it only renders when the class has a
 * flexible area count — hosts that never encounter that scenario
 * (e.g. apps/myk9show's planning view) can skip it without supplying
 * a stub. All other slots WILL be rendered by the page during normal
 * use and must be supplied.
 *
 * Flat shape
 * ----------
 * Considered grouping the class-options cascade (`ClassOptionsDialog`
 * + the four dialogs it gates) into a sub-bag, but the audit showed
 * the page renders each by name in JSX (never iterated), and hosts
 * are likely to want to override individual slots without
 * restructuring. Flat keeps it boring; future grouping is purely
 * additive.
 */
export interface EntryListDialogSlots {
  // Entry-level dialogs
  CheckinStatusDialog: ComponentType<CheckinStatusDialogProps>;

  // Class-level cascade
  ClassOptionsDialog: ComponentType<ClassOptionsDialogProps>;
  ClassStatusDialog: ComponentType<ClassStatusDialogProps>;
  ClassRequirementsDialog: ComponentType<ClassRequirementsDialogProps>;
  ClassSettingsDialog: ComponentType<ClassSettingsDialogProps>;
  MaxTimeDialog: ComponentType<MaxTimeDialogProps>;

  // Run order + print
  RunOrderDialog: ComponentType<RunOrderDialogProps>;
  ScoresheetPrintDialog: ComponentType<ScoresheetPrintDialogProps>;

  // Tiny info
  NoStatsDialog: ComponentType<NoStatsDialogProps>;

  // Optional — only renders when class has flexible area count.
  AreaCountSelectionDialog?: ComponentType<AreaCountSelectionDialogProps>;
}
