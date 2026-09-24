import { classifyPremiumPublishState } from '@/features/show-workbench/premiumPublishState';
import type { PublishInfo } from './usePublishInfo';

/**
 * What the premium publish control should say and whether it may be used.
 *
 * ONE derivation, because there are two controls: the Premium List card's own
 * button on Overview and the header Actions menu item, which offers the flow
 * from every section (MYK9-630). They disagreed in a way only the menu could be
 * wrong about -- with the premium published and current the card renders NO
 * publish button, while the menu still offered an enabled item that would
 * regenerate a live PDF nobody asked to change.
 */
export interface PremiumPublishAction {
  label: string;
  /** Absent when the control may be used. */
  disabledReason?: string;
}

export interface PremiumPublishFacts {
  hasPublishedPremium: boolean;
  /** Show data changed after the premium was published. */
  stale: boolean;
  /**
   * The PDF is current but the landing snapshot never published. Publishing the
   * premium also snapshots the landing content, so when that second write
   * failed the PDF can be current while the landing page is not; the same
   * republish action finishes the job, which is why this still offers it.
   */
  landingUnpublished: boolean;
  /** True when a publish would change something. */
  needsRepublish: boolean;
  action: PremiumPublishAction;
}

/**
 * Where the publish read stands. The query inherits networkMode 'online', so
 * its offline PAUSE must stay distinct from online loading: both have no data,
 * but only one can be resolved by reconnecting.
 */
export type PublishInfoState = 'loading' | 'offline' | 'ready' | 'unavailable';

export interface PremiumPublishInput {
  /** The publish read, or undefined when it has not resolved. */
  info: PublishInfo | undefined;
  infoState: PublishInfoState;
  /** This show's publish is already running, here or on the other control. */
  isBusy: boolean;
  /**
   * Whether staleness is the viewer's business. False for exhibitors, for whom
   * it is internal noise; the header menu is manager-only, so it passes true.
   */
  showStaleBadge: boolean;
}

export const PREMIUM_UP_TO_DATE_REASON = 'Premium is published and up to date';
export const PREMIUM_BUSY_REASON = 'Already publishing';
export const PREMIUM_LOADING_REASON = 'Checking the premium’s publish state…';
export const PREMIUM_OFFLINE_REASON = "You're offline — publishing needs a connection";
export const PREMIUM_UNAVAILABLE_REASON = 'Publish state could not be read';
export const PREMIUM_SETUP_REQUIRED_REASON =
  'Premium publishing setup is still being deployed. Try again shortly.';
const PUBLISH_LABEL = 'Generate & publish premium';

export function derivePremiumPublish({
  info,
  infoState,
  isBusy,
  showStaleBadge,
}: PremiumPublishInput): PremiumPublishFacts {
  const publishedLocator = info?.publishedLocator;
  const publishedAt = info?.publishedAt;
  const hasPublishedPremium = Boolean(
    (info?.hasPublishedPremium ?? Boolean(publishedLocator)) && publishedAt
  );
  const stale =
    showStaleBadge &&
    classifyPremiumPublishState({
      publishedPremiumUrl: publishedLocator,
      publishedPremiumAt: publishedAt,
      updatedAt: info?.updatedAt,
    }) === 'published-stale';
  const landingUnpublished = showStaleBadge && info?.experienceIsPublished === false;
  const needsRepublish = stale || landingUnpublished;

  const label = !hasPublishedPremium
    ? PUBLISH_LABEL
    : stale
      ? 'Republish premium'
      : 'Publish landing page';

  // Fail closed on anything but a resolved read: offering "Generate & publish"
  // against an unknown state is how the menu would regenerate a current PDF,
  // which is the defect this module exists to prevent.
  const action: PremiumPublishAction = isBusy
    ? { label: 'Publishing…', disabledReason: PREMIUM_BUSY_REASON }
    : infoState === 'unavailable'
      ? { label: PUBLISH_LABEL, disabledReason: PREMIUM_UNAVAILABLE_REASON }
      : infoState === 'offline'
        ? { label: PUBLISH_LABEL, disabledReason: PREMIUM_OFFLINE_REASON }
        : infoState === 'loading' || info === undefined
          ? { label: PUBLISH_LABEL, disabledReason: PREMIUM_LOADING_REASON }
          : info.versionedSchemaAvailable === false
            ? { label: PUBLISH_LABEL, disabledReason: PREMIUM_SETUP_REQUIRED_REASON }
            : hasPublishedPremium && !needsRepublish
              ? { label: PUBLISH_LABEL, disabledReason: PREMIUM_UP_TO_DATE_REASON }
              : { label };

  return { hasPublishedPremium, stale, landingUnpublished, needsRepublish, action };
}
