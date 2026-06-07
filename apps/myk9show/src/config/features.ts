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
} as const;

export type Features = typeof features;
