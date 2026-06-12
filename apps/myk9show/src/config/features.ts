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
 * Founding members bypass BlurGate while `people.early_adopter_until` is in
 * the future (see useSubscriptionGate), but still see "coming soon" for
 * flagged features.
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

  // Show-day presence (Phase 1, docs/plan-show-presence.md). KILL SWITCH.
  // ENABLED after live validation 2026-06-07 (#585 + cross-role two-context
  // browser smoke confirmed staff/exhibitor see each other on real Realtime and
  // the privacy filter holds). Opens the Realtime presence channel + renders the
  // avatar stack and per-ring judge dots. Flip to false to instantly close the
  // channel. (A runtime/remote flag for instant disable without a redeploy is the
  // §12-complete follow-up.)
  showPresence: true,

  // Show-day live-update nudge (Phase 2, docs/plan-show-presence-phase2.md).
  // KILL SWITCH. ENABLED after live validation 2026-06-07 (real-Realtime probe +
  // two-context browser smoke confirmed the show-live channel subscribes and the
  // replication:sync-requested nudge fires on a real entry change). Opens a
  // Realtime channel on the show's entries + classes that nudges the existing
  // incremental replication sync (~1-2s freshness instead of the 60s background
  // poll). Flip to false to instantly fall back to the 60s poll. Env override:
  // VITE_SHOW_LIVE_SYNC (for E2E / forcing the state in a given environment).
  showLiveSync: true,

  // Show-day soft edit-awareness (Phase 3, docs/plan-show-presence.md §6).
  // KILL SWITCH. When on, an edit surface advertises "this user is editing
  // <entity>" over the EXISTING presence channel (no new channel, no DB) and other
  // viewers see a calm, advisory "X is editing this" badge. Advisory only — never a
  // lock, never disables Save (that's Phase 4). Kept on its OWN flag (not reusing
  // the already-live showPresence) so it could dark-launch and be validated live
  // with two browsers — the discipline that caught three real Realtime bugs in
  // Phases 1-2. ENABLED for that live two-browser validation (run it on this PR's
  // Vercel preview before merge); flip back to false to instantly close it. Env
  // override: VITE_SHOW_EDIT_AWARENESS=true.
  showEditAwareness: true,

  // Phase 4 conflict surfacing (docs/plan-show-presence.md §6 Phase 4 + §12).
  // KILL SWITCH — smoke-tested 2026-06-08; enabled after toast + both resolution
  // paths (keep-mine/take-theirs) confirmed correct in live browser smoke test.
  // When on, same-field collisions at the replication sync chokepoint surface as
  // `replication:conflict` window events and a persistent Sonner toast prompts reconcile.
  // Covers ALL replicated tables (entries, classes, shows, dogs, …) automatically.
  // Rollback = flip to false; existing field-merge/LWW path is byte-for-byte unchanged.
  // Env override: VITE_SHOW_CONFLICT_SURFACING=true (for E2E / manual smoke).
  showConflictSurfacing: true,
} as const;

export type Features = typeof features;
