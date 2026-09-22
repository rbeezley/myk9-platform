import { useCallback } from 'react';
import { create } from 'zustand';
import { useQueryClient } from '@tanstack/react-query';
import { notifications } from '@/lib/notifications';
import { publishInfoQueryKey } from './usePublishInfo';
import { useGeneratePremium } from './useGeneratePremium';
import {
  classifyPremiumPublishError,
  GENERIC_PREMIUM_PUBLISH_FAILURE,
  premiumPublishFailureMessage,
} from './premiumPublishErrors';
import {
  beginPremiumPublishAttempt,
  discardPremiumPublishAttempt,
  getPremiumPublishAttempt,
  publishGeneratedPremiumAttempt,
} from './premiumPublishCoordinator';

const PUBLISH_FAILURE_MESSAGE = GENERIC_PREMIUM_PUBLISH_FAILURE;

export interface PremiumPublishShowState {
  inFlight: boolean;
  failed: boolean;
  failureMessage?: string;
}

interface PremiumPublishStore {
  /** Per SHOW. A secretary can hold two shows open in two tabs of one app. */
  byShowId: Record<string, PremiumPublishShowState>;
  begin: (showId: string) => void;
  succeed: (showId: string) => void;
  fail: (showId: string, failureMessage: string) => void;
}

const IDLE: PremiumPublishShowState = { inFlight: false, failed: false };

function patch(
  state: PremiumPublishStore,
  showId: string,
  next: PremiumPublishShowState
): Pick<PremiumPublishStore, 'byShowId'> {
  return { byShowId: { ...state.byShowId, [showId]: next } };
}

/**
 * Publish state lives in a STORE, not in the card, because the flow has two
 * triggers in different subtrees: the Premium List card on Overview and the
 * header Actions menu, which offers it from every section (MYK9-630). Component
 * state would let the header fire a second publish while the card was already
 * mid-flight, and would show "Publishing…" on only one of them.
 *
 * Keyed BY SHOW, not global. A single in-flight id made show A's publish
 * silently no-op show B's button, and `begin` cleared the failure flag for
 * every show at once, wiping A's "Try again" notice the moment B started.
 */
export const usePremiumPublishStore = create<PremiumPublishStore>()(set => ({
  byShowId: {},
  begin: showId => set(state => patch(state, showId, { inFlight: true, failed: false })),
  succeed: showId =>
    set(state => ({
      ...patch(state, showId, IDLE),
    })),
  fail: (showId, failureMessage) =>
    set(state => patch(state, showId, { inFlight: false, failed: true, failureMessage })),
}));

export function premiumPublishStateFor(
  byShowId: Record<string, PremiumPublishShowState>,
  showId: string
): PremiumPublishShowState {
  return byShowId[showId] ?? IDLE;
}

export interface GenerateAndPublishPremium {
  /** Generate the premium PDF and publish it with the landing snapshot. */
  run: () => Promise<void>;
  /** True while THIS show's premium is generating or publishing, anywhere. */
  isBusy: boolean;
  /** True when this show's last attempt failed and has not been retried. */
  publishFailed: boolean;
  failureMessage: string;
}

/**
 * THE premium generate-and-publish flow. One implementation, two callers: the
 * Premium List card's button and the header Actions menu's "Generate & publish
 * premium". The menu item used to be a link to the card's anchor, which was a
 * promise the router could not keep -- `pushState` is not fragment navigation,
 * so from another section the card was never scrolled to or highlighted, and at
 * 375px nothing moved at all.
 */
export function useGenerateAndPublishPremium(showId: string): GenerateAndPublishPremium {
  const queryClient = useQueryClient();
  const { generate } = useGeneratePremium();
  const byShowId = usePremiumPublishStore(state => state.byShowId);
  const begin = usePremiumPublishStore(state => state.begin);
  const succeed = usePremiumPublishStore(state => state.succeed);
  const fail = usePremiumPublishStore(state => state.fail);
  const showState = premiumPublishStateFor(byShowId, showId);

  const run = useCallback(async () => {
    if (!showId) return;
    // Read through `getState` rather than the subscribed value: two triggers can
    // be clicked within one render, and the latch has to see the write the
    // other one just made. Scoped to THIS show -- another show's publish is
    // none of this one's business.
    if (premiumPublishStateFor(usePremiumPublishStore.getState().byShowId, showId).inFlight) {
      return;
    }
    begin(showId);
    try {
      const cachedAttempt = getPremiumPublishAttempt(showId);
      if (!cachedAttempt) await beginPremiumPublishAttempt(showId);
      let premium = cachedAttempt?.intent.premium;
      if (!premium) {
        try {
          premium = await generate(showId);
        } catch (error) {
          discardPremiumPublishAttempt(showId);
          throw error;
        }
      }
      await publishGeneratedPremiumAttempt({
        showId,
        premium,
        inkSaver: false,
      });
      await Promise.all([
        queryClient.refetchQueries({ queryKey: publishInfoQueryKey(showId), type: 'active' }),
        queryClient.invalidateQueries({
          queryKey: ['shows', showId, 'published-experience-content'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['shows'],
          predicate: query => query.queryKey[2] !== 'publish-info',
        }),
      ]);
      succeed(showId);
      notifications.success('Premium list published');
    } catch (error) {
      const classified = classifyPremiumPublishError(error, 'generation');
      fail(showId, premiumPublishFailureMessage(classified));
      notifications.error(premiumPublishFailureMessage(classified));
    }
  }, [showId, begin, succeed, fail, generate, queryClient]);

  return {
    run,
    isBusy: showState.inFlight,
    publishFailed: showState.failed,
    failureMessage: showState.failureMessage ?? PUBLISH_FAILURE_MESSAGE,
  };
}
