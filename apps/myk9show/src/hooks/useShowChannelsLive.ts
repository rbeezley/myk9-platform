import { useEffect, useState } from 'react';
import {
  subscribeToShowChanges,
  type ShowChangeStatus,
} from '@/features/show-live-sync/showChangeSignal';
import { useIsOnline } from '@/hooks/useNetworkStatus';

interface ChannelStatuses {
  /** The show list these statuses were reported for; a new list starts empty. */
  forShowIds: readonly string[];
  byShow: Readonly<Record<string, ShowChangeStatus>>;
}

const noop = (): void => {};

/**
 * True only while the browser is online AND every show's realtime change channel
 * reports SUBSCRIBED (MYK9-1306). Anything else, including no status yet, is
 * false, so a caller that skips its fallback poll while this is true falls back
 * to polling the moment a channel drops, times out or the device goes offline.
 *
 * Shares the registry's one channel per show; it adds a status listener only and
 * ignores the change signals themselves.
 */
export function useShowChannelsLive(showIds: readonly string[]): boolean {
  const isOnline = useIsOnline();
  const [statuses, setStatuses] = useState<ChannelStatuses>({ forShowIds: showIds, byShow: {} });

  useEffect(() => {
    const unsubscribes = showIds.map(showId =>
      subscribeToShowChanges(showId, noop, status => {
        setStatuses(previous => ({
          forShowIds: showIds,
          byShow: {
            ...(previous.forShowIds === showIds ? previous.byShow : {}),
            [showId]: status,
          },
        }));
      })
    );
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [showIds]);

  if (!isOnline || showIds.length === 0 || statuses.forShowIds !== showIds) return false;
  return showIds.every(showId => statuses.byShow[showId] === 'SUBSCRIBED');
}
