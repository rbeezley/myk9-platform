/**
 * Pure presentation helpers for the at-show ringside chrome slots
 * (ClassDetailsPopover, SyncIndicator, CompactOfflineIndicator).
 *
 * These translate myK9Q's semantic-CSS look (`apps/myk9q/.../dialogs/
 * ClassDetailsPopover.css`, `apps/myk9q/.../ui/SyncIndicator.tsx`) into the
 * Tailwind/shadcn idiom myK9Show uses. myK9Q derives status colours from
 * `--success/--warning/--info` tokens that myK9Show's shadcn theme does not
 * define, so we map each semantic state to an explicit palette tier with a
 * dark-mode variant rather than redeclaring theme tokens (see memory
 * `feedback_ringside_token_inherit`).
 *
 * Kept JSX-free and dependency-free so they unit-test cleanly and keep the
 * slot module under the 500-line ceiling.
 */

/**
 * Colour tiers shared by every ringside chrome badge / pill.
 *
 * `live` is distinct from `success`: per DESIGN.md's "Ring Green Rule", the
 * Ring Green token is reserved EXCLUSIVELY for live judging ("a dog is in the
 * ring right now"). It renders as a SOLID green pill (white text) so it is the
 * one chip that pops against the soft-tinted statuses around it — letting a
 * gate steward glance a ring list and instantly see which class is live.
 */
export type BadgeTier = 'success' | 'warning' | 'info' | 'neutral' | 'destructive' | 'live';

const BADGE_CLASS: Record<BadgeTier, string> = {
  success: 'bg-green-500/15 text-success ',
  warning: 'bg-amber-500/15 text-warning ',
  info: 'bg-blue-500/15 text-info ',
  neutral: 'bg-[color:var(--chip-stone-bg)] text-[color:var(--chip-stone-fg)]',
  destructive: 'bg-destructive/15 text-destructive ',
  // Solid Ring Green, theme-invariant by design (no dark override on --live).
  // White-on-#4e7c53 measures 4.85:1 — AA for the pill's text-xs label.
  live: 'bg-[var(--live)] text-white ',
};

/** Tailwind background+text classes for a badge/pill of the given tier. */
export function badgeClass(tier: BadgeTier): string {
  return BADGE_CLASS[tier];
}

// ---------------------------------------------------------------------------
// Class status (popover "Status:" row) — mirrors myK9Q STATUS_LABELS/STATUS_STYLES
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  none: 'Not Started',
  setup: 'Setup',
  briefing: 'Briefing',
  in_progress: 'In Progress',
  break: 'Break',
  completed: 'Completed',
};

const STATUS_TIERS: Record<string, BadgeTier> = {
  none: 'info',
  setup: 'warning',
  briefing: 'warning',
  // Live judging earns the solid Ring Green pill (DESIGN.md "Ring Green Rule"),
  // matching the class-list card so the popover and list agree. The popover
  // only has the raw DB status (`in_progress`), so we key off it directly —
  // smart-detection (`getClassStatusColor`) isn't available without the full
  // ClassEntry. Ring Green is reserved for live judging; never render via --success.
  in_progress: 'live',
  break: 'info',
  upcoming: 'info',
  completed: 'neutral',
  offline: 'destructive',
};

/** Human label for a class status, falling back to the raw value. */
export function getClassStatusLabel(status?: string): string | null {
  if (!status) return null;
  return STATUS_LABELS[status] ?? status;
}

/** Badge tier for a class status (defaults to `info` for unknown values). */
export function getClassStatusTier(status?: string): BadgeTier {
  if (!status) return 'info';
  return STATUS_TIERS[status] ?? 'info';
}

/**
 * Badge tier for the at-show class-list card pill, keyed off ringside's
 * smart-detection colour key (`getClassStatusColor`) rather than the raw DB
 * status — so a class whose dogs are in the ring reads `live` even if its
 * stored status lags.
 *
 * Only `in-progress` earns the Ring Green `live` tier (DESIGN.md "Ring Green
 * Rule"). Prep states (setup/briefing/start-time) and offline scoring are
 * amber `warning`; a break is `info`; done / not-yet-started recede to
 * `neutral`. The colour vocabulary lets a steward triage a ring list at a
 * glance: green = go, amber = getting ready, grey = nothing happening.
 */
const CLASS_STATUS_COLOR_TIER: Record<string, BadgeTier> = {
  'in-progress': 'live',
  'offline-scoring': 'warning',
  setup: 'warning',
  briefing: 'warning',
  'start-time': 'warning',
  break: 'info',
  completed: 'neutral',
  'no-status': 'neutral',
};

/**
 * Map a ringside class-status colour key (from `getClassStatusColor`) to a
 * badge tier for the class-list card pill. Unknown keys recede to `neutral`.
 */
export function getClassListStatusTier(colorKey: string): BadgeTier {
  return CLASS_STATUS_COLOR_TIER[colorKey] ?? 'neutral';
}

// ---------------------------------------------------------------------------
// Results visibility (popover "Results:" row)
// ---------------------------------------------------------------------------

const VISIBILITY_LABELS: Record<string, string> = {
  open: 'Open',
  standard: 'Standard',
  review: 'Review',
  custom: 'Custom',
};

const VISIBILITY_TIERS: Record<string, BadgeTier> = {
  open: 'success',
  standard: 'info',
  review: 'warning',
};

/** Human label for a results-visibility preset, falling back to the raw value. */
export function getVisibilityLabel(preset?: string): string | null {
  if (!preset) return null;
  return VISIBILITY_LABELS[preset] ?? preset;
}

/** Badge tier for a results-visibility preset. */
export function getVisibilityTier(preset?: string): BadgeTier {
  if (!preset) return 'info';
  return VISIBILITY_TIERS[preset] ?? 'info';
}

// ---------------------------------------------------------------------------
// Self check-in (popover "Check-in:" row)
// ---------------------------------------------------------------------------

/** Label for the check-in mode: self-service vs. table (gate-steward). */
export function getCheckinLabel(enabled: boolean): string {
  return enabled ? 'Self' : 'Table';
}

/** Badge tier for the check-in mode. */
export function getCheckinTier(enabled: boolean): BadgeTier {
  return enabled ? 'success' : 'neutral';
}

// ---------------------------------------------------------------------------
// Sync indicator — mirrors myK9Q SyncIndicator statusConfig
// ---------------------------------------------------------------------------

export type SyncIndicatorStatusValue = 'synced' | 'syncing' | 'pending' | 'offline' | 'error';

const SYNC_LABELS: Record<SyncIndicatorStatusValue, string> = {
  synced: 'Synced',
  syncing: 'Syncing…',
  // Idle with queued writes — calm, not alarming (offline is normal, PRODUCT.md).
  pending: 'Waiting to sync',
  offline: 'Offline',
  error: 'Sync error',
};

const SYNC_TIERS: Record<SyncIndicatorStatusValue, BadgeTier> = {
  synced: 'success',
  syncing: 'info',
  pending: 'neutral',
  offline: 'neutral',
  error: 'destructive',
};

/** Human label for a sync status. */
export function getSyncLabel(status: SyncIndicatorStatusValue): string {
  return SYNC_LABELS[status];
}

/** Badge tier for a sync status. */
export function getSyncTier(status: SyncIndicatorStatusValue): BadgeTier {
  return SYNC_TIERS[status];
}

// ---------------------------------------------------------------------------
// Time formatting (popover "Max Time:" row) — mirrors myK9Q formatTime
// ---------------------------------------------------------------------------

/**
 * Format a duration in seconds as `M:SS`, or null when unset / invalid.
 *
 * Guards non-finite and negative input: upstream adapters sometimes put a
 * placeholder string (e.g. `"TBD"`) into the numeric `timeLimitSeconds` field,
 * which would otherwise format as `"NaN:NaN"`. `Number.isFinite` rejects both
 * `NaN` and non-numeric values, so the caller can fall back cleanly.
 */
export function formatRingTime(seconds?: number): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}
