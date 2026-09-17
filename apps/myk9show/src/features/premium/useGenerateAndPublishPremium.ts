import { useCallback } from 'react';
import { create } from 'zustand';
import { useQueryClient } from '@tanstack/react-query';
import { publishExperience } from '@/features/experience/publishExperience';
import { notifications } from '@/lib/notifications';
import { publishInfoQueryKey } from './usePublishInfo';
import { useGeneratePremium } from './useGeneratePremium';

const PUBLISH_FAILURE_MESSAGE = "We couldn't publish the premium list. Please try again.";

interface PremiumPublishState {
  /** The show whose premium is being generated/published right now, if any. */
  publishingShowId: string | null;
  /** The show whose last attempt failed, so the card can offer "Try again". */
  failedShowId: string | null;
  begin: (showId: string) => void;
  succeed: () => void;
  fail: (showId: string) => void;
}

/**
 * Publish state lives in a STORE, not in the card, because the flow now has two
 * triggers in different subtrees: the Premium List card on Overview and the
 * header Actions menu, which offers it from every section (MYK9-630). Component
 * state would let the header fire a second publish while the card was already
 * mid-flight, and would show "Publishing…" on only one of them.
 */
export const usePremiumPublishStore = create<PremiumPublishState>()(set => ({
  publishingShowId: null,
  failedShowId: null,
  begin: showId => set({ publishingShowId: showId, failedShowId: null }),
  succeed: () => set({ publishingShowId: null, failedShowId: null }),
  fail: showId => set({ publishingShowId: null, failedShowId: showId }),
}));

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
  const publishingShowId = usePremiumPublishStore(state => state.publishingShowId);
  const failedShowId = usePremiumPublishStore(state => state.failedShowId);
  const begin = usePremiumPublishStore(state => state.begin);
  const succeed = usePremiumPublishStore(state => state.succeed);
  const fail = usePremiumPublishStore(state => state.fail);

  const run = useCallback(async () => {
    if (!showId) return;
    // Read through `getState` rather than the subscribed value: two triggers can
    // be clicked within one render, and the latch has to see the write the
    // other one just made.
    if (usePremiumPublishStore.getState().publishingShowId) return;
    begin(showId);
    try {
      const premium = await generate(showId);
      await publishExperience({ showId, premium, inkSaver: false });
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
      succeed();
      notifications.success('Premium list published');
    } catch {
      fail(showId);
      notifications.error('Could not publish the premium list');
    }
  }, [showId, begin, succeed, fail, generate, queryClient]);

  return {
    run,
    isBusy: publishingShowId === showId && showId !== '',
    publishFailed: failedShowId === showId && showId !== '',
    failureMessage: PUBLISH_FAILURE_MESSAGE,
  };
}
