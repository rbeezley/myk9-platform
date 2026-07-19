export const SHOW_STATUS_CONTROL_ANCHOR = 'show-status-control';
// Distinct anchors for the two cards inside the shared #setup-publish row
// (see SETUP_PUBLISH_ANCHOR in setupReadinessSignals.ts). A setup signal must
// land on the exact control that clears it, not just "somewhere in the row" —
// rendered on PremiumDownloadCard / LandingPageCard themselves.
export const PREMIUM_CARD_ANCHOR = 'setup-publish-premium';
export const LANDING_CARD_ANCHOR = 'setup-publish-landing';

export function isShowListingLive(status: string | null | undefined): boolean {
  return ['published', 'upcoming', 'in_progress', 'completed'].includes(
    (status ?? '').toLowerCase()
  );
}
