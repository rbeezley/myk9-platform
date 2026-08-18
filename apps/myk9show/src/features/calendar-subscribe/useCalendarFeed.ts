import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  buildCalendarFeedUrls,
  getCalendarFeedBaseUrl,
  type CalendarFeedUrls,
} from './calendarFeedUrls';

/**
 * useCalendarFeed — issue, rotate and revoke an exhibitor's webcal token for
 * one show.
 *
 * The token value is returned by the RPC and held only in component state. It
 * is deliberately NOT cached anywhere persistent: it is a credential, and the
 * exhibitor can always re-issue. Rotating invalidates the previous URL, which
 * is the recovery path if a link is shared by accident.
 */
export interface UseCalendarFeedResult {
  urls: CalendarFeedUrls | null;
  loading: boolean;
  error: string | null;
  /** Issue or rotate. Returns the URLs, or null when it failed. */
  issue: (showId: string) => Promise<CalendarFeedUrls | null>;
  /** Disable the current URL. Clears local state on success. */
  revoke: (showId: string) => Promise<boolean>;
  /** False when no feed base URL is configured — callers should hide the UI. */
  configured: boolean;
}

/**
 * `issue_/revoke_calendar_feed_token` are newer than the checked-in generated
 * `Database` types (migration 20260816130000), so the client is narrowed
 * structurally here — the same escape hatch dogFavoritesSync and
 * notificationPreferenceSync use. One cast, in one place; drop it once the
 * types regenerate.
 */
function calendarFeedRpc(
  fn: 'issue_calendar_feed_token' | 'revoke_calendar_feed_token',
  args: { p_show_id: string }
): Promise<{ data: unknown; error: { message: string } | null }> {
  return (
    supabase as unknown as {
      rpc: (
        name: string,
        params: Record<string, unknown>
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    }
  ).rpc(fn, args);
}

export function useCalendarFeed(): UseCalendarFeedResult {
  const [urls, setUrls] = useState<CalendarFeedUrls | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const baseUrl = getCalendarFeedBaseUrl();

  const issue = useCallback(
    async (showId: string): Promise<CalendarFeedUrls | null> => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: rpcError } = await calendarFeedRpc('issue_calendar_feed_token', {
          p_show_id: showId,
        });
        if (rpcError) throw new Error(rpcError.message);

        const next = buildCalendarFeedUrls(String(data ?? ''), baseUrl);
        if (!next) throw new Error('Calendar feed is not configured');
        setUrls(next);
        return next;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not create the calendar link');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [baseUrl]
  );

  const revoke = useCallback(async (showId: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const { error: rpcError } = await calendarFeedRpc('revoke_calendar_feed_token', {
        p_show_id: showId,
      });
      if (rpcError) throw new Error(rpcError.message);
      setUrls(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not turn off the calendar link');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return { urls, loading, error, issue, revoke, configured: baseUrl.length > 0 };
}
