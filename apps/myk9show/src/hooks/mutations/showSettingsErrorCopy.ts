/**
 * MYK9-1844: what the show-settings saves (visibility, venue WiFi, settings for a
 * selection of classes) say when they fail. Each is a single upsert or update, so
 * trying again is safe.
 */
export const SHOW_SETTINGS_COPY = {
  showVisibilityFailed: "We couldn't save the visibility for this show. Try again.",
  trialVisibilityFailed: "We couldn't save the visibility for this trial. Try again.",
  classVisibilityFailed: "We couldn't save the visibility for this class. Try again.",
  /** A replicated show write; it may have been saved on this device before the failure. */
  showSwitchFailed:
    "We couldn't save that change to the show. Check the switch before you try again.",
  wifiFailed: "We couldn't save the WiFi details. Try again.",
  showCheckinFailed: "We couldn't save the self check-in setting for this show. Try again.",
  selectedClassesCheckinFailed:
    "We couldn't change self check-in for the selected classes. Try again.",
  /** Shared by the results-visibility and self check-in bulk bars. */
} as const;
