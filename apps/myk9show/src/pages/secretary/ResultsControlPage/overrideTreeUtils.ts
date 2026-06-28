/**
 * Pure cascade + status helpers for the unified OverrideTree.
 *
 * The tree shows two independent facets per row — results **visibility** and self
 * **check-in** — and each can sit at a different level of the cascade. These helpers
 * compute, per facet, both the status label and the effective control value, keeping
 * the JSX dumb and the inheritance logic unit-testable.
 *
 * Cascades (both resolved independently):
 *   visibility[field] = class.override[field] ?? trial.override[field] ?? show[field]
 *   checkin           = class.selfCheckin     ?? trial.selfCheckin     ?? show.selfCheckin
 */

import {
  PRESET_INFO,
  detectPreset,
  fieldTimingsFromVisibility,
  hasVisibilityOverride,
  resolveVisibilityCascade,
  type VisibilityOverride,
  type VisibilityPreset,
  type VisibilitySettings,
} from '@myk9/secretary';
import type {
  ShowSettings,
  TrialOverrideEntry,
  ClassOverrideEntry,
} from '@/hooks/queries/useShowSettingsDatabase';

/** Where a facet's effective value comes from. */
export type InheritSource = 'show' | 'trial' | 'class';

export interface VisibilityFacet {
  /** Has an explicit override at this row's own level. */
  hasOverride: boolean;
  /** Preset to show as the Select value (null → placeholder "Inherit"). */
  preset: VisibilityPreset | null;
  /** Where the effective value resolves from. */
  source: InheritSource;
  /** Human label, e.g. "Override: review" / "Inheriting from trial". */
  label: string;
}

export interface CheckinFacet {
  hasOverride: boolean;
  /** Effective on/off after the full cascade — the Switch `checked` value. */
  effective: boolean;
  source: InheritSource;
  label: string;
}

/**
 * Label a facet relative to the row's OWN level: `source === ownLevel` means an
 * explicit override here; otherwise the value is inherited from `source` (a parent).
 * This is why "trial" can mean either "this trial's override" (on a trial row) or
 * "inheriting from the trial" (on a class row).
 */
function inheritedPresetLabel(
  show: VisibilitySettings,
  trialOverride?: VisibilityOverride
): string {
  const resolved = resolveVisibilityCascade(show, trialOverride);
  const preset = detectPreset(fieldTimingsFromVisibility(resolved));
  return preset ? PRESET_INFO[preset].title : 'Custom';
}

function visibilityLabel(params: {
  ownLevel: InheritSource;
  source: InheritSource;
  preset: VisibilityPreset | null;
  settings: ShowSettings;
  trialOverride?: VisibilityOverride | undefined;
}): string {
  const { ownLevel, source, preset, settings, trialOverride } = params;
  if (source === ownLevel) return `Override: ${preset ?? 'custom'}`;
  if (source === 'show')
    return `Inheriting from show · ${inheritedPresetLabel(settings.visibility)}`;
  return `Inheriting from trial · ${inheritedPresetLabel(settings.visibility, trialOverride)}`;
}

function checkinLabel(ownLevel: InheritSource, source: InheritSource): string {
  if (source === ownLevel) return 'Override active';
  if (source === 'show') return 'Inheriting from show';
  return 'Inheriting from trial';
}

// ── Trial level ──────────────────────────────────────────────────────────────

export function resolveTrialVisibility(
  settings: ShowSettings,
  override?: TrialOverrideEntry
): VisibilityFacet {
  const hasOverride = !!override && hasVisibilityOverride(override.override);
  const preset = override?.override.preset ?? null;
  const source: InheritSource = hasOverride ? 'trial' : 'show';
  return {
    hasOverride,
    preset,
    source,
    label: visibilityLabel({
      ownLevel: 'trial',
      source,
      preset,
      settings,
      trialOverride: override?.override,
    }),
  };
}

export function resolveTrialCheckin(
  settings: ShowSettings,
  override?: TrialOverrideEntry
): CheckinFacet {
  const trialCheckin = override?.selfCheckinEnabled ?? null;
  const hasOverride = trialCheckin !== null;
  const source: InheritSource = hasOverride ? 'trial' : 'show';
  return {
    hasOverride,
    effective: trialCheckin ?? settings.selfCheckinEnabled,
    source,
    label: checkinLabel('trial', source),
  };
}

// ── Class level ──────────────────────────────────────────────────────────────

export function resolveClassVisibility(
  settings: ShowSettings,
  classOverride: ClassOverrideEntry | undefined,
  trialOverride: TrialOverrideEntry | undefined
): VisibilityFacet {
  const hasOverride = !!classOverride && hasVisibilityOverride(classOverride.override);
  const preset = classOverride?.override.preset ?? null;
  const trialHasOverride = !!trialOverride && hasVisibilityOverride(trialOverride.override);
  const source: InheritSource = hasOverride ? 'class' : trialHasOverride ? 'trial' : 'show';
  return {
    hasOverride,
    preset,
    source,
    label: visibilityLabel({
      ownLevel: 'class',
      source,
      preset,
      settings,
      trialOverride: trialOverride?.override,
    }),
  };
}

export function resolveClassCheckin(
  settings: ShowSettings,
  classOverride: ClassOverrideEntry | undefined,
  trialOverride: TrialOverrideEntry | undefined
): CheckinFacet {
  const classCheckin = classOverride?.selfCheckinEnabled ?? null;
  const trialCheckin = trialOverride?.selfCheckinEnabled ?? null;
  const hasOverride = classCheckin !== null;
  const source: InheritSource =
    classCheckin !== null ? 'class' : trialCheckin !== null ? 'trial' : 'show';
  return {
    hasOverride,
    effective: classCheckin ?? trialCheckin ?? settings.selfCheckinEnabled,
    source,
    label: checkinLabel('class', source),
  };
}

/** Count classes in a trial that carry an explicit visibility OR check-in override. */
export function countOverriddenClasses(
  classIds: string[],
  classOverrides: ClassOverrideEntry[]
): number {
  const byId = new Map(classOverrides.map(o => [o.classId, o]));
  return classIds.filter(id => {
    const o = byId.get(id);
    if (!o) return false;
    return hasVisibilityOverride(o.override) || o.selfCheckinEnabled !== null;
  }).length;
}
