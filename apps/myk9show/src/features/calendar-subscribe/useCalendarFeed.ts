import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  buildCalendarFeedUrls,
  EVENT_COUNT_HEADER,
  getCalendarFeedBaseUrl,
  type CalendarFeedUrls,
} from './calendarFeedUrls';

/**
 * The inspection is a HEAD, so it never counts as a fetch of the feed —
 * `last_fetched_at` is how the platform measures whether anyone actually
 * subscribes, and opening a dialog is not subscribing.
 *
 * Bounded because the dialog waits for it: the exhibitor must not see the Add
 * and Save buttons before the "nothing to add yet" warning that belongs above
 * them. A probe that stalls resolves as unknown and the buttons appear
 * unwarned, which is the same place we were before — never a hung dialog.
 */
const INSPECT_TIMEOUT_MS = 4000;

async function inspectFeed(url: string): Promise<number | null> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), INSPECT_TIMEOUT_MS);
  try {
    const response = await fetch(url, { method: 'HEAD', signal: abort.signal });
    if (!response.ok) return null;
    const raw = response.headers.get(EVENT_COUNT_HEADER);
    if (raw === null) return null; // Older deploy: unknown, so do not warn.
    const count = Number(raw);
    return Number.isInteger(count) && count >= 0 ? count : null;
  } catch {
    // Offline, blocked, aborted or CORS — no warning rather than a wrong one.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

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
  /**
   * Events in the issued feed, or null when it could not be read. 0 means the
   * link works but has nothing in it yet, which the dialog must say out loud —
   * otherwise the exhibitor adds a calendar and sees silence (MYK9-506).
   */
  eventCount: number | null;
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
  const [eventCount, setEventCount] = useState<number | null>(null);
  const baseUrl = getCalendarFeedBaseUrl();

  const issue = useCallback(
    async (showId: string): Promise<CalendarFeedUrls | null> => {
      setLoading(true);
      setError(null);
      setEventCount(null);
      try {
        const { data, error: rpcError } = await calendarFeedRpc('issue_calendar_feed_token', {
          p_show_id: showId,
        });
        if (rpcError) throw new Error(rpcError.message);

        const next = buildCalendarFeedUrls(String(data ?? ''), baseUrl);
        if (!next) throw new Error('Calendar feed is not configured');

        // Inspect BEFORE publishing the URLs. The dialog shows its actions the
        // moment `urls` is set, so setting it first would open a window in
        // which an exhibitor can add an empty calendar without ever seeing the
        // warning meant to precede the buttons.
        setEventCount(await inspectFeed(next.displayUrl));
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
      setEventCount(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not turn off the calendar link');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return { urls, loading, error, issue, revoke, eventCount, configured: baseUrl.length > 0 };
}
