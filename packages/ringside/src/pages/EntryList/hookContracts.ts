/**
 * EntryListHandlers & EntryListActions — direct-arg DI bags for the
 * EntryList page (PR E2d).
 *
 * Architecture (A1 — Maximal slot-injection, confirmed PR E2c)
 * ------------------------------------------------------------
 * The ringside EntryList page is a controlled render function. It
 * doesn't call any of the host's service-coupled hooks itself —
 * instead it receives their *return values* as opaque bags from the
 * host shim.
 *
 * The host (apps/myk9q today; apps/myk9show's `/at-show` route in
 * Phase 1) calls:
 *   - `useEntryListHandlers()` — pulls reportService, runOrderService,
 *     entryService, placementService, scoresheetRouter, supabase,
 *     replicatedClassesTable, useAuth, usePermission, usePrefetch,
 *     useLongPress
 *   - `useEntryListActions()` — pulls entryService + replication cache
 *   - `useEntryListEffects()` — pulls supabase + organizationUtils
 *     (returns void; the shim just calls it for its side effects)
 *
 * …and threads the resulting `EntryListHandlers` + `EntryListActions`
 * bags into ringside as props. The third hook (effects) has no return
 * value, so there's no bag for it — the shim's call is its own
 * contract.
 *
 * Why not move the hooks into ringside with services slotted?
 * ----------------------------------------------------------
 * That was Option C in the E2d audit and the path the file-audit
 * recommended. We rejected it because:
 *   1. The host's services (reportService, scoresheetRouter, etc.) are
 *      not being moved — apps/myk9q sunsets in Phase 6 anyway,
 *      refactoring them is sunk cost.
 *   2. The `RingsideProvider` context shipped in PR E0.5 has never been
 *      mounted by any host. Adding a services slot to a never-mounted
 *      context would be the speculative widening that E2b's
 *      design-note warns against.
 *   3. PRs E1d, E2b, and E2c all chose direct-arg DI for the same
 *      reason. Consistency.
 *
 * The trade-off this locks in: ringside's EntryList page can never
 * mount standalone — always needs a host shim. Fine because both
 * existing consumers (apps/myk9q today, apps/myk9show's `/at-show`
 * route tomorrow) will provide one.
 *
 * Inversion of ownership
 * ----------------------
 * Before this PR, the host's `useEntryListHandlers` and
 * `useEntryListActions` had no formal return-type interfaces — each
 * was inferred via TypeScript from the `return { ... }` shape. After
 * this PR, the ringside interfaces in this file ARE the contract;
 * the host hooks must conform. If the host's return shape drifts, the
 * shim wiring fails at compile time — which is exactly the safety net
 * we want.
 */

import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from 'react';
import type { Entry } from '../../stores/entryStore';
import type { RunOrderPreset } from './dialogSlots';

// =============================================================================
// Supporting types — co-located so the contract file is self-contained.
// =============================================================================

/**
 * Sort orders the report/print pipeline accepts. Mirrors the
 * apps/myk9q `ReportSortOrder` union (defined in
 * `apps/myk9q/src/services/reportService.ts`). Inlined here because
 * ringside doesn't depend on the host's services and shouldn't import
 * them.
 *
 * Distinct from the dialog-side `PrintSortOrder` in `./dialogSlots`:
 * `ReportSortOrder` is what the print *handler* accepts; `PrintSortOrder`
 * is what the print *dialog* surfaces to the user. The two unions
 * happen to overlap today but should not be unified — they describe
 * different layers.
 */
export type ReportSortOrder = 'run-order' | 'armband' | 'placement';

/**
 * Status value `handleStatusChange` accepts. The first six values
 * mirror `CheckInStatus`; the last two (`'in-ring'`, `'completed'`)
 * are ring-management states that get mapped onto separate underlying
 * service calls (`handleMarkInRing` / `handleMarkCompleted`).
 *
 * Kept inline rather than aliasing to `CheckInStatus | 'in-ring' |
 * 'completed'` because the host's `useEntryListHandlers` already
 * spells the union out literally — matching its shape keeps the
 * `satisfies` checks tight.
 */
export type EntryStatusChange =
  | 'no-status'
  | 'checked-in'
  | 'conflict'
  | 'pulled'
  | 'at-gate'
  | 'come-to-gate'
  | 'in-ring'
  | 'completed';

/**
 * Status value `useEntryListActions.handleStatusChange` accepts. Same
 * as `EntryStatusChange` minus the two ring-management states (those
 * are handled by `handleMarkInRing` / `handleMarkCompleted` instead
 * of the unified status-change path).
 */
export type EntryStatusCheckIn =
  | 'no-status'
  | 'checked-in'
  | 'conflict'
  | 'pulled'
  | 'at-gate'
  | 'come-to-gate';

/**
 * Long-press gesture handler bag. Mirrors `LongPressHandlers` from
 * `@myk9/scoring-ui` — inlined here because scoring-ui is not a
 * ringside dep and one structural interface doesn't warrant a new
 * package coupling. If a future PR makes ringside depend on
 * scoring-ui for other reasons, this can re-export from there.
 */
export interface LongPressHandlers {
  onMouseDown: (e: ReactMouseEvent) => void;
  onMouseUp: (e: ReactMouseEvent) => void;
  onMouseLeave: (e: ReactMouseEvent) => void;
  onTouchStart: (e: ReactTouchEvent) => void;
  onTouchEnd: (e: ReactTouchEvent) => void;
}

// =============================================================================
// EntryListHandlers — return shape of the host's useEntryListHandlers
// =============================================================================

/**
 * The 22-field handler bag the ringside EntryList page consumes. Each
 * field maps 1:1 to a `return { ... }` key in apps/myk9q's
 * `useEntryListHandlers.ts`. The host hook stays where it is — pulling
 * reportService, runOrderService, scoresheetRouter, entryService,
 * placementService, supabase, replicatedClassesTable, useAuth,
 * usePermission, usePrefetch, useLongPress — and the shim threads its
 * return into ringside through this interface.
 *
 * Field-by-field:
 *  - 6 service-coupled handlers (setDogInRingStatus, handlePrintScoresheet
 *    which queries class_requirements directly, handleApplyRunOrder,
 *    handleRecalculatePlacements, handleStatusDialogChange, handleEntryClick
 *    via tryApplyFixedMaxTime) — implementation lives host-side
 *  - 16 pure-ish callbacks (navigation, UI state setters, route building,
 *    delegate-only wrappers) — moving them to ringside would still need
 *    the underlying services
 *
 * See the audit notes in the handoff doc for the full classification.
 */
export interface EntryListHandlers {
  // ── Routing helpers ────────────────────────────────────────────────
  /** Build the scoresheet URL for an entry. Pure routing — no side effects. */
  getScoreSheetRoute: (entry: Entry) => string;

  // ── Per-entry mutations (service-coupled) ─────────────────────────
  /**
   * Toggle an entry's in-ring status. Handles "other entry must leave
   * the ring first" — calls `markInRing(otherEntry.id, false)` for
   * every currently-in-ring entry that isn't this one, then sets the
   * target. Returns `true` on success, `false` on error.
   */
  setDogInRingStatus: (dogId: string, inRing: boolean) => Promise<boolean>;

  // ── Entry tap handlers (mixed) ────────────────────────────────────
  /**
   * Tap-to-score handler: permission check, max-time gate, optimistic
   * local update, fire-and-forget in-ring set, navigate to scoresheet.
   * Handles the "tryApplyFixedMaxTime → either auto-apply and refresh
   * or open MaxTimeDialog" branch.
   */
  handleEntryClick: (entry: Entry) => void;

  /**
   * Hover/touch prefetch hint. Wakes up the scoresheet bundle for the
   * tapped entry plus the next 1-2 entries in pending order. No
   * mutation — pure cache warming.
   */
  handleEntryPrefetch: (entry: Entry) => void;

  // ── Status mutations (delegate-only; underlying hooks are host) ──
  /**
   * Unified status change for an entry. Switches on the target status
   * and delegates to `handleMarkInRing`, `handleMarkCompleted`, or the
   * generic `handleStatusChangeHook` from `useEntryListActions`.
   * Applies optimistic local update before the async call.
   */
  handleStatusChange: (entryId: string, status: EntryStatusChange) => Promise<void>;

  /**
   * Open the per-entry status popup. Respects the "exhibitor + self
   * check-in disabled → show SelfCheckinDisabledDialog" branch.
   */
  handleStatusClick: (e: ReactMouseEvent, entryId: string) => void;

  // ── Reset menu / dialog ───────────────────────────────────────────
  /** Open the reset menu popup anchored at the click point. */
  handleResetMenuClick: (e: ReactMouseEvent, entryId: string) => void;
  /** Close the reset menu and queue the reset-confirm dialog. */
  handleResetScore: (entry: Entry) => void;
  /** Apply the reset: optimistic local clear, switch to pending tab, fire async. */
  confirmResetScore: () => Promise<void>;
  /** Close the reset-confirm dialog without applying. */
  cancelResetScore: () => void;
  /** Close the reset menu popup without queuing the dialog. */
  closeResetMenu: () => void;

  // ── Run order ─────────────────────────────────────────────────────
  /**
   * Apply a run-order preset (asc/desc, random, armband, manual).
   * Service-coupled — calls `applyRunOrderPreset` from runOrderService
   * which may mutate the DB. The `'manual'` preset is special: it
   * opens drag-to-reorder mode instead of applying a numeric preset.
   */
  handleApplyRunOrder: (preset: RunOrderPreset) => Promise<void>;
  /** Switch the entry list into drag-to-reorder mode. UI-only. */
  handleOpenDragMode: () => void;

  // ── Refresh ───────────────────────────────────────────────────────
  /**
   * Pull-to-refresh / button-tap refresh. Forces a sync with min 500ms
   * spinner duration so the user sees feedback even on a fast network.
   */
  handleManualRefresh: () => Promise<void>;
  /** Hard refresh = `window.location.reload()`. Triggered by long-press. */
  handleHardRefresh: () => void;
  /** Long-press gesture handlers bound to the refresh button. */
  refreshLongPressHandlers: LongPressHandlers;

  // ── Placement recalc (service-coupled) ────────────────────────────
  /**
   * Recompute placements for the class. Calls
   * `manuallyRecalculatePlacements()` from placementService, then
   * refreshes. Surfaces an alert on failure.
   */
  handleRecalculatePlacements: () => Promise<void>;

  // ── Print (service-coupled) ───────────────────────────────────────
  /** Generate the check-in PDF report. */
  handlePrintCheckIn: (options?: { sortOrder?: ReportSortOrder }) => void;
  /** Generate the results PDF report. */
  handlePrintResults: (options?: { sortOrder?: 'placement' | 'armband' }) => void;
  /**
   * Generate the scoresheet PDF report. ASYNC because this handler
   * directly queries Supabase's `class_requirements` table for
   * hides/distractions text before generating — that one Supabase
   * call is what makes this hook host-coupled rather than purely
   * routable through reportService.
   */
  handlePrintScoresheet: (options?: {
    sortOrder?: ReportSortOrder;
    showSectionBadge?: boolean;
  }) => Promise<void>;

  // ── Class-status dialog (service-coupled) ─────────────────────────
  /**
   * Apply a class-status change (briefing / break / start / completed)
   * with optional time value. Calls
   * `replicatedClassesTable.updateClassStatus()` and re-throws on
   * error so the dialog can keep itself open.
   */
  handleStatusDialogChange: (status: string, timeValue?: string) => Promise<void>;

  // ── Stats navigation ──────────────────────────────────────────────
  /**
   * Navigate to the stats page for the current trial+class. Returns
   * `false` when there are no completed entries — the page uses that
   * signal to open NoStatsDialog instead of navigating.
   */
  handleStatisticsClick: () => void | boolean;
}

// =============================================================================
// EntryListActions — return shape of the host's useEntryListActions
// =============================================================================

/**
 * The 8-field action bag the ringside EntryList page consumes. Used
 * primarily by `useEntryListHandlers` upstream (which threads
 * `handleStatusChange`, `handleResetScore`, `handleMarkInRing`,
 * `handleMarkCompleted` from this bag into its own parameters), but
 * the page also reads `isSyncing` and `hasError` directly for the
 * status indicators in the header.
 *
 * Field-by-field:
 *  - 6 entry mutations (status change, reset, in-ring toggle, mark
 *    in-ring, mark completed, batch status) — all service-coupled,
 *    all use the optimistic-update pattern via `useOptimisticUpdate`
 *  - 2 state flags (isSyncing, hasError) — derived from the
 *    optimistic-update hook's internal queue state
 *
 * The host's `useEntryListActions(refresh)` takes a refresh callback
 * as its sole argument; the shim provides that from the data hook.
 * Ringside doesn't see the refresh wiring.
 */
export interface EntryListActions {
  // ── Single-entry mutations ────────────────────────────────────────
  /**
   * Optimistic check-in status change. Updates the replication cache
   * first (offline-first), then the database. Status is restricted to
   * the six "check-in" values — ring-management states (`'in-ring'`,
   * `'completed'`) go through `handleMarkInRing` /
   * `handleMarkCompleted` instead.
   */
  handleStatusChange: (entryId: string, newStatus: EntryStatusCheckIn) => Promise<void>;

  /**
   * Reset an entry's score. Background-only (fire-and-forget) — UI
   * already cleared optimistically by the time this lands.
   */
  handleResetScore: (entryId: string) => Promise<void>;

  /**
   * Toggle in-ring (flip current → !current). Background, silently
   * fails offline. The unified handler in `useEntryListHandlers`
   * generally prefers `handleMarkInRing` for explicit set semantics.
   */
  handleToggleInRing: (entryId: string, currentInRing: boolean) => Promise<void>;

  /**
   * Explicit "mark this entry as in-ring" — used for ring management.
   * `currentStatus` is captured so it can be restored if the user
   * cancels out of the scoresheet without scoring.
   */
  handleMarkInRing: (entryId: string, currentStatus?: Entry['status']) => Promise<void>;

  /**
   * Mark an entry completed without going through the full scoresheet.
   * For manual ring management when scoring happens off-platform.
   */
  handleMarkCompleted: (entryId: string) => Promise<void>;

  /**
   * Batch status update for future bulk-action flows. Not currently
   * surfaced in the page UI but the host exports it.
   */
  handleBatchStatusUpdate: (
    entryIds: string[],
    newStatus: EntryStatusCheckIn,
  ) => Promise<void>;

  // ── Sync state flags (derived from useOptimisticUpdate internals) ─
  /** True while at least one optimistic mutation is in flight. */
  isSyncing: boolean;
  /** True if the last optimistic mutation errored. */
  hasError: boolean;
}
