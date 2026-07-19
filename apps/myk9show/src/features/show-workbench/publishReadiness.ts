import type { Show } from '@/types/show-types';
import { classifyPremiumPublishState, type PremiumPublishStateInput } from './premiumPublishState';

export const SHOW_STATUS_CONTROL_ANCHOR = 'show-status-control';
// Distinct anchors for the two cards inside the shared #setup-publish row
// (see SETUP_PUBLISH_ANCHOR in setupReadinessSignals.ts). Each checklist item
// must land on the exact control it fixes, not just "somewhere in the row" —
// rendered on PremiumDownloadCard / LandingPageCard themselves.
export const PREMIUM_CARD_ANCHOR = 'setup-publish-premium';
export const LANDING_CARD_ANCHOR = 'setup-publish-landing';

export type PublishReadinessItemId = 'show-visibility' | 'premium-pdf' | 'landing-content';

export interface PublishReadinessItem {
  id: PublishReadinessItemId;
  title: string;
  state: string;
  description: string;
  actionLabel: string;
  href: string;
  isReady: boolean;
}

export function isShowListingLive(status: string | null | undefined): boolean {
  return ['published', 'upcoming', 'in_progress', 'completed'].includes(
    (status ?? '').toLowerCase()
  );
}

export function buildPublishReadinessItems(
  show: Show,
  premiumInfo?: PremiumPublishStateInput
): PublishReadinessItem[] {
  const showListingLive = isShowListingLive(show.status);
  const premiumState = classifyPremiumPublishState(premiumInfo ?? show);
  const premiumPublished = premiumState !== 'unpublished';
  const premiumCurrent = premiumState === 'published-current';
  const landingPublished = Boolean(show.experienceIsPublished);

  return [
    {
      id: 'show-visibility',
      title: 'Show listing',
      state: showListingLive ? 'Show listing is live' : 'Show listing is still draft',
      description: showListingLive
        ? 'Exhibitors can open the show page, and entry buttons follow the entry dates.'
        : 'Draft shows stay hidden from exhibitors until you publish the show.',
      actionLabel: showListingLive ? 'Manage show status' : 'Publish show listing',
      href: `#${SHOW_STATUS_CONTROL_ANCHOR}`,
      isReady: showListingLive,
    },
    {
      id: 'premium-pdf',
      title: 'Premium PDF',
      state: premiumCurrent
        ? 'Premium PDF is published'
        : premiumPublished
          ? 'Premium PDF needs republish'
          : 'Premium PDF is not published yet',
      description: premiumCurrent
        ? 'The downloadable premium list is ready for exhibitors.'
        : premiumPublished
          ? 'The PDF is published, but show data has changed since then.'
          : 'Generate and publish the premium list before exhibitors need the official PDF.',
      actionLabel: premiumCurrent
        ? 'View premium actions'
        : premiumPublished
          ? 'Republish premium PDF'
          : 'Publish premium PDF',
      href: `#${PREMIUM_CARD_ANCHOR}`,
      isReady: premiumCurrent,
    },
    {
      id: 'landing-content',
      title: 'Landing page content',
      state: landingPublished
        ? 'Landing page content is published'
        : 'Landing page content is not published yet',
      description: landingPublished
        ? 'The public landing page is using the saved exhibitor copy and show style.'
        : 'Publishing the premium list also snapshots the exhibitor-facing landing content.',
      actionLabel: landingPublished ? 'View landing actions' : 'Publish landing content',
      href: `#${LANDING_CARD_ANCHOR}`,
      isReady: landingPublished,
    },
  ];
}
