import { usePublishInfo } from './usePublishInfo';
import { useGenerateAndPublishPremium } from './useGenerateAndPublishPremium';
import {
  derivePremiumPublish,
  type PremiumPublishFacts,
  type PublishInfoState,
} from './premiumPublishAction';
import type { PublishInfo } from './usePublishInfo';

export interface PremiumPublishControl extends PremiumPublishFacts {
  run: () => Promise<void>;
  isBusy: boolean;
  publishFailed: boolean;
  failureMessage: string;
  info: PublishInfo | undefined;
  infoState: PublishInfoState;
}

/**
 * THE composed premium publish control: the read, the derivation and the flow,
 * in one place so the Premium List card and the header Actions item cannot
 * offer different things. Before this, the card hid its button once the premium
 * was published and current while the menu still offered an enabled item that
 * would regenerate a live PDF (MYK9-630 round 5).
 *
 * @param showStaleBadge whether staleness is this viewer's business — false for
 * exhibitors, true for anyone who can actually publish.
 * @param canManageShow whether the viewer's show-management scope has resolved
 * true. The publish-info read stays disabled until this gate opens.
 */
export function usePremiumPublishControl(
  showId: string,
  showStaleBadge: boolean,
  canManageShow: boolean
): PremiumPublishControl {
  const query = usePublishInfo(showId, canManageShow);
  // Disabled React Query observers can retain cached data. Never derive a
  // management action or published-state label from it until this render has
  // a resolved management scope.
  const info = canManageShow ? query.data : undefined;
  const flow = useGenerateAndPublishPremium(showId);

  const infoState: PublishInfoState = !canManageShow
    ? 'loading'
    : query.fetchStatus === 'paused'
      ? 'offline'
      : query.isError
        ? 'unavailable'
        : info === undefined
          ? 'loading'
          : 'ready';

  const facts = derivePremiumPublish({
    info,
    infoState,
    isBusy: flow.isBusy,
    showStaleBadge,
  });

  return { ...facts, ...flow, info, infoState };
}
