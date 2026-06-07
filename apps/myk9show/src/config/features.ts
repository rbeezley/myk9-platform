/**
 * Feature flags for the early adopter exhibitor release.
 *
 * Flip a flag to `true` and redeploy — the "coming soon" screen
 * becomes the real page. No other code changes required.
 *
 * Two distinct gates exist in the app:
 *  - features.*       → shows a "coming soon" screen (feature not ready yet)
 *  - BlurGate/premium → blurs content, shows upgrade CTA (premium upsell)
 *
 * Early adopter users bypass BlurGate via `is_early_adopter` on `people`
 * (see useSubscriptionGate), but still see "coming soon" for flagged features.
 */
export const features = {
  // Dog tools — live for early adopters
  titleTracking: true,
  trainingJournal: true,
  healthRecords: true,
  pedigree: true,

  // Dog Details tabs — hidden until show management is ready
  competitionsTab: true,
  statisticsTab: true,

  // Show management — coming soon for exhibitors
  showRegistration: true,
  myEntries: true,
  calendar: false,
  showDay: false,
  analytics: false,
  showMap: true,

  // Show-day presence (Phase 1, docs/plan-show-presence.md). KILL SWITCH, not a
  // "coming soon" gate: dark by default. Flip true to open the Realtime presence
  // channel + render the avatar stack. (A runtime/remote flag for instant disable
  // without a redeploy is the §12-complete follow-up.)
  showPresence: false,

  // Show-day live-update nudge (Phase 2, docs/plan-show-presence-phase2.md).
  // KILL SWITCH. ENABLED after live validation 2026-06-07 (real-Realtime probe +
  // two-context browser smoke confirmed the show-live channel subscribes and the
  // replication:sync-requested nudge fires on a real entry change). Opens a
  // Realtime channel on the show's entries + classes that nudges the existing
  // incremental replication sync (~1-2s freshness instead of the 60s background
  // poll). Flip to false to instantly fall back to the 60s poll. Env override:
  // VITE_SHOW_LIVE_SYNC (for E2E / forcing the state in a given environment).
  showLiveSync: true,
} as const;

export type Features = typeof features;
