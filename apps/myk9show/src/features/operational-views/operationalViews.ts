/**
 * Operational views — typed model, curated presets, and per-surface validators.
 *
 * See openspec/changes/operational-views-and-display-presets/{proposal,design}.md
 * and specs/operational-views/spec.md for the binding contract (Decisions 1-6).
 *
 * ## Task 1.1 — Inventory (Entry Management)
 *
 * Entry Management's URL normalizers serialize the legacy operational-view
 * model to search params:
 *   - `attention` -> EntryAttentionFilter (all | pending | missing_information |
 *     accepted | waitlist | issues). The live cockpit replaces this with its
 *     `queue` list (the Show: menu's checked queues), where the status-filter
 *     INTENT guard now lives.
 *   - `payment` -> EntryPaymentFilter (all | pending | paid_online |
 *     paid_by_check | paid_by_cash | waived | refunded).
 *   - `mode` -> EntryWorkMode (review | day-of) — a curated combination of
 *     attention/payment/view via ENTRY_WORK_MODE_PRESETS.
 *   - `view` -> EntryManagementViewMode (table | cards) — display, not a filter.
 *   - `trial`, `class` -> scope (comma lists of trial/class ids), not validated
 *     here; the cockpit writes both in one step (`writeCockpitScope`), and a
 *     class may be picked with no trial.
 *   - `roster` -> boolean display toggle, trial-scoped only (orphan cleared by
 *     the normalizer when `trial` is absent).
 *   - `entryTab` (legacy) and `attention=move-ups|pulled` (legacy) migrate to
 *     `tab=exceptions&queue=...`, which is NOT part of this operational-view
 *     model (a surface swap, not a filter — see entryManagementFilters.ts).
 *   - NOT URL-backed: `search`/`person` free-text term (component state,
 *     re-synced from URL on mount) and row `selection` (in-memory Set, cleared
 *     on filter/view changes per Design Decision 4).
 *
 * Class Management used to be the second surface here; it merged into Setup → Classes
 * (MYK9-924), whose views are `classesTabViews.ts`, so it has no operational-view model.
 */

import {
  ENTRY_WORK_MODE_VALUES,
  ENTRY_VIEW_MODE_VALUES,
  isEntryAttentionFilter,
  isEntryPaymentFilter,
  type EntryAttentionFilter,
  type EntryPaymentFilter,
  type EntryWorkMode,
  type EntryManagementViewMode,
} from '@/components/entries/management/entryManagementFilters';
import { PaymentStatus } from '@/types/show-registration-types';

// ---------------------------------------------------------------------------
// Serialization version
// ---------------------------------------------------------------------------

/**
 * Bump when the shape of `OperationalView` (or a surface's filter set) changes
 * in a way that makes previously serialized views unsafe to reapply.
 * Validation rejects a mismatched version.
 */
export const OPERATIONAL_VIEW_SERIALIZATION_VERSION = 1;

// ---------------------------------------------------------------------------
// Surface ownership
// ---------------------------------------------------------------------------

export const OPERATIONAL_VIEW_SURFACE_IDS = ['entry-management'] as const;
export type OperationalViewSurfaceId = (typeof OPERATIONAL_VIEW_SURFACE_IDS)[number];

export function isOperationalViewSurfaceId(
  value: string | null | undefined
): value is OperationalViewSurfaceId {
  return OPERATIONAL_VIEW_SURFACE_IDS.includes(value as OperationalViewSurfaceId);
}

// ---------------------------------------------------------------------------
// Allowlisted display settings (Design Decision 3)
// ---------------------------------------------------------------------------

export const OPERATIONAL_VIEW_DENSITY_VALUES = ['comfortable', 'compact'] as const;
export type OperationalViewDensity = (typeof OPERATIONAL_VIEW_DENSITY_VALUES)[number];

export function isOperationalViewDensity(
  value: string | null | undefined
): value is OperationalViewDensity {
  return OPERATIONAL_VIEW_DENSITY_VALUES.includes(value as OperationalViewDensity);
}

/**
 * Entry Management display presets (spec scenario "Show-day display is
 * selected"). `show-day` = compact density + PRIORITY for armband, dog,
 * class, and check-in information (column emphasis/reordering from the
 * ENTRY_MANAGEMENT_OPTIONAL_COLUMN_VALUES allowlist: armband + checkIn) —
 * nothing is hidden; identity, current status, selection controls, and the
 * row action menu are always retained (Design Decision 3).
 */
export const ENTRY_DISPLAY_PRESET_VALUES = ['standard', 'show-day'] as const;
export type EntryDisplayPreset = (typeof ENTRY_DISPLAY_PRESET_VALUES)[number];

export function isEntryDisplayPreset(
  value: string | null | undefined
): value is EntryDisplayPreset {
  return ENTRY_DISPLAY_PRESET_VALUES.includes(value as EntryDisplayPreset);
}

/**
 * Columns a display preset MAY prioritize/hide. Identity, current state,
 * selection controls, and the row action menu are always retained by the
 * surface regardless of this allowlist (Design Decision 3) — they are not
 * represented here because they can never be toggled off.
 */
export const ENTRY_MANAGEMENT_OPTIONAL_COLUMN_VALUES = [
  'payment',
  'review',
  'armband',
  'checkIn',
] as const;
export type EntryManagementOptionalColumn =
  (typeof ENTRY_MANAGEMENT_OPTIONAL_COLUMN_VALUES)[number];

export interface OperationalViewDisplaySettings<TColumn extends string> {
  density?: OperationalViewDensity;
  /** Allowlisted optional columns to prioritize. Unlisted columns fall back to the surface default. */
  columns?: readonly TColumn[];
}

function sanitizeColumns<TColumn extends string>(
  columns: readonly unknown[] | undefined,
  allowlist: readonly TColumn[]
): TColumn[] | undefined {
  if (!columns) return undefined;
  const allowed = new Set<string>(allowlist);
  const sanitized = columns.filter(
    (value): value is TColumn => typeof value === 'string' && allowed.has(value)
  );
  return sanitized.length > 0 ? sanitized : undefined;
}

function sanitizeDisplaySettings<TColumn extends string>(
  display: OperationalViewDisplaySettings<TColumn> | undefined,
  columnAllowlist: readonly TColumn[]
): OperationalViewDisplaySettings<TColumn> | undefined {
  if (!display) return undefined;
  const density = isOperationalViewDensity(display.density) ? display.density : undefined;
  const columns = sanitizeColumns(display.columns, columnAllowlist);
  if (!density && !columns) return undefined;
  return { ...(density ? { density } : {}), ...(columns ? { columns } : {}) };
}

// ---------------------------------------------------------------------------
// Typed operational-view model (Design Decision 1)
// ---------------------------------------------------------------------------

export interface EntryManagementOperationalView {
  surface: 'entry-management';
  version: typeof OPERATIONAL_VIEW_SERIALIZATION_VERSION;
  filters: {
    attention: EntryAttentionFilter;
    payment: EntryPaymentFilter;
    mode: EntryWorkMode;
    view: EntryManagementViewMode;
  };
  /** Scope ids are opaque; validity against the current show is the surface's job at apply-time, not this module's. */
  scope?: {
    showId?: string;
    trialId?: string;
    classId?: string;
  };
  display?: OperationalViewDisplaySettings<EntryManagementOptionalColumn>;
}

export type OperationalView = EntryManagementOperationalView;

// ---------------------------------------------------------------------------
// Per-surface validators
// ---------------------------------------------------------------------------

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function sanitizeScope(
  scope: unknown
): { showId?: string; trialId?: string; classId?: string } | undefined {
  if (!scope || typeof scope !== 'object') return undefined;
  const raw = scope as Record<string, unknown>;
  const showId = isNonEmptyString(raw.showId) ? raw.showId : undefined;
  const trialId = isNonEmptyString(raw.trialId) ? raw.trialId : undefined;
  const classId = isNonEmptyString(raw.classId) ? raw.classId : undefined;
  if (!showId && !trialId && !classId) return undefined;
  return {
    ...(showId ? { showId } : {}),
    ...(trialId ? { trialId } : {}),
    ...(classId ? { classId } : {}),
  };
}

/**
 * Validate an unknown value as an EntryManagementOperationalView. Unsupported
 * filter/display values are dropped to documented safe defaults rather than
 * rejecting the whole view, matching the spec's "Invalid view parameter"
 * scenario. Returns null only when the value isn't shaped like a view for
 * this surface at all.
 */
export function validateEntryManagementView(value: unknown): EntryManagementOperationalView | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (raw.surface !== 'entry-management') return null;
  if (raw.version !== OPERATIONAL_VIEW_SERIALIZATION_VERSION) return null;

  const filtersRaw = (raw.filters ?? {}) as Record<string, unknown>;
  const attention = isEntryAttentionFilter(
    typeof filtersRaw.attention === 'string' ? filtersRaw.attention : null
  )
    ? (filtersRaw.attention as EntryAttentionFilter)
    : 'all';
  const payment = isEntryPaymentFilter(
    typeof filtersRaw.payment === 'string' ? filtersRaw.payment : null
  )
    ? (filtersRaw.payment as EntryPaymentFilter)
    : 'all';
  const mode = ENTRY_WORK_MODE_VALUES.includes(filtersRaw.mode as EntryWorkMode)
    ? (filtersRaw.mode as EntryWorkMode)
    : 'review';
  const view = ENTRY_VIEW_MODE_VALUES.includes(filtersRaw.view as EntryManagementViewMode)
    ? (filtersRaw.view as EntryManagementViewMode)
    : 'table';

  const scope = sanitizeScope(raw.scope);
  const display = sanitizeDisplaySettings(
    raw.display as OperationalViewDisplaySettings<EntryManagementOptionalColumn> | undefined,
    ENTRY_MANAGEMENT_OPTIONAL_COLUMN_VALUES
  );

  return {
    surface: 'entry-management',
    version: OPERATIONAL_VIEW_SERIALIZATION_VERSION,
    filters: { attention, payment, mode, view },
    ...(scope ? { scope } : {}),
    ...(display ? { display } : {}),
  };
}

/** Validate an unknown value against whichever surface it claims to be. Returns null on a shape/surface mismatch. */
export function validateOperationalView(value: unknown): OperationalView | null {
  if (!value || typeof value !== 'object') return null;
  const surface = (value as Record<string, unknown>).surface;
  if (surface === 'entry-management') return validateEntryManagementView(value);
  return null;
}

// ---------------------------------------------------------------------------
// Curated presets (Design Decision 2)
// ---------------------------------------------------------------------------

export const ENTRY_MANAGEMENT_PRESET_IDS = [
  'needs-review',
  'payment-due',
  'needs-check-in',
  'all-entries',
] as const;
export type EntryManagementPresetId = (typeof ENTRY_MANAGEMENT_PRESET_IDS)[number];

export type OperationalViewPresetId = EntryManagementPresetId;

export function isEntryManagementPresetId(
  value: string | null | undefined
): value is EntryManagementPresetId {
  return ENTRY_MANAGEMENT_PRESET_IDS.includes(value as EntryManagementPresetId);
}

export interface OperationalViewPresetDefinition<TView extends OperationalView> {
  id: string;
  label: string;
  /** Build the preset's view definition. Scope is layered on by the caller (surface-specific ids), not baked in here. */
  build: () => Omit<TView, 'scope'>;
}

/**
 * Entries: Needs review, Payment due, Needs check-in, All entries — Design
 * Decision 2. Each preset is defined purely in terms of the existing
 * attention/payment/mode/view vocabulary (`ENTRY_WORK_MODE_PRESETS` is the
 * `review`/`day-of` shorthand this reuses for mode+view); there is exactly one
 * preset system, per the "Relationship to existing Quick View presets" note.
 */
export const ENTRY_MANAGEMENT_PRESETS: Record<
  EntryManagementPresetId,
  OperationalViewPresetDefinition<EntryManagementOperationalView>
> = {
  'needs-review': {
    id: 'needs-review',
    label: 'Needs review',
    build: () => ({
      surface: 'entry-management',
      version: OPERATIONAL_VIEW_SERIALIZATION_VERSION,
      filters: { attention: 'pending', payment: 'all', mode: 'review', view: 'table' },
    }),
  },
  'payment-due': {
    id: 'payment-due',
    label: 'Payment due',
    build: () => ({
      surface: 'entry-management',
      version: OPERATIONAL_VIEW_SERIALIZATION_VERSION,
      filters: {
        attention: 'accepted',
        payment: PaymentStatus.PENDING,
        mode: 'review',
        view: 'table',
      },
    }),
  },
  'needs-check-in': {
    id: 'needs-check-in',
    label: 'Needs check-in',
    build: () => ({
      surface: 'entry-management',
      version: OPERATIONAL_VIEW_SERIALIZATION_VERSION,
      filters: { attention: 'accepted', payment: 'all', mode: 'day-of', view: 'table' },
    }),
  },
  'all-entries': {
    id: 'all-entries',
    label: 'All entries',
    build: () => ({
      surface: 'entry-management',
      version: OPERATIONAL_VIEW_SERIALIZATION_VERSION,
      filters: { attention: 'all', payment: 'all', mode: 'review', view: 'table' },
    }),
  },
};
