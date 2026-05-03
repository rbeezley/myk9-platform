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
  competitionsTab: false,
  statisticsTab: false,

  // Show management — coming soon for exhibitors
  showRegistration: false,
  myEntries: false,
  calendar: false,
  showDay: false,
  analytics: false,
} as const;

export type Features = typeof features;
