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
  // KILL SWITCH, dark by default. Flip true to open a Realtime channel on the
  // show's entries + classes that nudges the existing incremental replication
  // sync (~1-2s freshness instead of the 60s background poll). When off, the
  // 60s ReplicationSyncProvider poll still keeps data fresh — this only makes it
  // faster. Env override: VITE_SHOW_LIVE_SYNC=true (for E2E / live validation).
  showLiveSync: false,
} as const;

export type Features = typeof features;
