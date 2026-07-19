import type { EntryManagementOperationalView } from '@/features/operational-views/operationalViews';
import {
  ENTRY_WORK_MODE_PRESETS,
  type EntryAttentionFilter,
  type EntryPaymentFilter,
  type EntryManagementViewMode,
  type EntryDisplayPreset,
  type EntryWorkMode,
  type OperationalViewDensity,
} from '@/components/entries/management/entryManagementFilters';
import {
  ENTRY_MANAGEMENT_PRESETS,
  type EntryManagementPresetId,
} from '@/features/operational-views/operationalViews';

/**
 * Pure URLSearchParams-writing helpers for `useEntryManagementFilters`.
 * Extracted so the hook's callbacks stay thin `setSearchParams` wrappers —
 * each function takes the previous params and returns the next params,
 * matching the exact write semantics the hook relied on before extraction.
 */

export function writeAttentionFilter(
  prev: URLSearchParams,
  filter: EntryAttentionFilter
): URLSearchParams {
  const next = new URLSearchParams(prev);
  if (filter === 'all') next.delete('attention');
  else next.set('attention', filter);
  next.delete('entryTab');
  return next;
}

export function writePaymentFilter(
  prev: URLSearchParams,
  payment: EntryPaymentFilter
): URLSearchParams {
  const next = new URLSearchParams(prev);
  if (payment === 'all') next.delete('payment');
  else next.set('payment', payment);
  return next;
}

export function writeWorkMode(prev: URLSearchParams, mode: EntryWorkMode): URLSearchParams {
  const preset = ENTRY_WORK_MODE_PRESETS[mode];
  const next = new URLSearchParams(prev);
  if (mode === 'review') next.delete('mode');
  else next.set('mode', mode);
  if (preset.attention === 'all') next.delete('attention');
  else next.set('attention', preset.attention);
  if (preset.view === 'table') next.delete('view');
  else next.set('view', preset.view);
  if (preset.payment === 'all') next.delete('payment');
  else next.set('payment', preset.payment);
  next.delete('entryTab');
  next.delete('tab');
  return next;
}

export function writePreset(
  prev: URLSearchParams,
  presetId: EntryManagementPresetId
): URLSearchParams {
  const { filters } = ENTRY_MANAGEMENT_PRESETS[presetId].build();
  const next = new URLSearchParams(prev);
  if (filters.attention === 'all') next.delete('attention');
  else next.set('attention', filters.attention);
  if (filters.payment === 'all') next.delete('payment');
  else next.set('payment', filters.payment);
  if (filters.mode === 'review') next.delete('mode');
  else next.set('mode', filters.mode);
  if (filters.view === 'table') next.delete('view');
  else next.set('view', filters.view);
  next.delete('entryTab');
  next.delete('tab');
  return next;
}

/**
 * Apply a full (curated preset or restored saved) view, including display
 * settings — used by `SavedViewsControl`'s reapply action so a restored
 * view goes through the same normalized-URL path as every other filter
 * change (design.md Decision 1: surfaces own the adapter, never a second
 * state path).
 */
export function writeView(
  prev: URLSearchParams,
  view: EntryManagementOperationalView
): URLSearchParams {
  const { filters, scope, display } = view;
  const next = new URLSearchParams(prev);
  if (scope?.trialId) {
    next.set('trial', scope.trialId);
    if (scope.classId) next.set('class', scope.classId);
    else next.delete('class');
  } else {
    next.delete('trial');
    next.delete('class');
    next.delete('roster');
  }
  if (filters.attention === 'all') next.delete('attention');
  else next.set('attention', filters.attention);
  if (filters.payment === 'all') next.delete('payment');
  else next.set('payment', filters.payment);
  if (filters.mode === 'review') next.delete('mode');
  else next.set('mode', filters.mode);
  if (filters.view === 'table') next.delete('view');
  else next.set('view', filters.view);
  const density = display?.density ?? 'comfortable';
  if (density === 'comfortable') next.delete('density');
  else next.set('density', density);
  next.delete('entryTab');
  next.delete('tab');
  return next;
}

export function writeEntryViewMode(
  prev: URLSearchParams,
  view: EntryManagementViewMode
): URLSearchParams {
  const next = new URLSearchParams(prev);
  if (view === 'table') next.delete('view');
  else next.set('view', view);
  return next;
}

export function writeDensity(
  prev: URLSearchParams,
  value: OperationalViewDensity
): URLSearchParams {
  const next = new URLSearchParams(prev);
  if (value === 'comfortable') next.delete('density');
  else next.set('density', value);
  return next;
}

export function writeDisplayPreset(
  prev: URLSearchParams,
  value: EntryDisplayPreset
): URLSearchParams {
  const next = new URLSearchParams(prev);
  if (value === 'standard') next.delete('display');
  else next.set('display', value);
  return next;
}

export function writeRosterView(prev: URLSearchParams, on: boolean): URLSearchParams {
  const next = new URLSearchParams(prev);
  if (on) next.set('roster', '1');
  else next.delete('roster');
  return next;
}

export function writeTrialFilter(prev: URLSearchParams, id: string | null): URLSearchParams {
  const next = new URLSearchParams(prev);
  if (id) {
    next.set('trial', id);
  } else {
    next.delete('trial');
    // Roster is meaningless without a trial — drop it too.
    next.delete('roster');
  }
  // Always clear class when trial changes
  next.delete('class');
  return next;
}

export function writeClassFilter(prev: URLSearchParams, id: string | null): URLSearchParams {
  const next = new URLSearchParams(prev);
  if (id) {
    next.set('class', id);
  } else {
    next.delete('class');
  }
  return next;
}

export function writeShowScopeReset(prev: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(prev);
  next.delete('trial');
  next.delete('class');
  next.delete('roster');
  return next;
}
