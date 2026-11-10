/**
 * MYK9-1844: what Results Control says when a setting does not load or save. The
 * words match the screen's own labels ("Results visibility", "Self check-in",
 * "Reset"). Every save is an upsert, so trying again is harmless even when a slow
 * save did land after the screen gave up on it.
 */
import { SHOW_SETTINGS_COPY } from '@/hooks/mutations/showSettingsErrorCopy';

export const RESULTS_CONTROL_COPY = {
  /** Alert titles; the description under each says to check the connection and try again. */
  loadFailedTitle: "We couldn't load the results settings",
  refreshFailedTitle: "We couldn't refresh the results settings",
  checkinFailed: SHOW_SETTINGS_COPY.showCheckinFailed,
  privacyFailed: "We couldn't save the results privacy setting for this show. Try again.",
  visibilityFailed: "We couldn't save the results visibility for this show. Try again.",
} as const;

export type ResultsSettingLevel = 'trial' | 'class';
export type ResultsSettingFacet = 'visibility' | 'checkin';

const FACET_WORDS: Record<ResultsSettingFacet, string> = {
  visibility: 'results visibility',
  checkin: 'self check-in',
};

/** A trial's or class's own visibility or check-in choice did not save. */
export function resultsSettingSaveFailed(
  level: ResultsSettingLevel,
  facet: ResultsSettingFacet
): string {
  return `We couldn't save the ${FACET_WORDS[facet]} for this ${level}. Try again.`;
}

/** Resetting a trial or class back to the setting above it did not save. */
export function resultsSettingResetFailed(
  level: ResultsSettingLevel,
  facet: ResultsSettingFacet
): string {
  return `We couldn't reset the ${FACET_WORDS[facet]} for this ${level}. Try again.`;
}

/** Applying a named preset to the selected classes did not save. */
export function presetApplyFailed(presetTitle: string): string {
  return `We couldn't apply "${presetTitle}" to the selected classes. Try again.`;
}
