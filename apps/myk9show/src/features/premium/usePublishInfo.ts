import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';

export interface PublishInfo {
  /** Stored locator for state/staleness only; never use as a download href. */
  publishedLocator: string | null;
  hasPublishedPremium: boolean;
  publishedPath?: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  /** MYK9-2201: when premium narrative/supplemental edits were last saved as a draft. */
  contentDraftSavedAt?: string | null;
  /** Whether the exhibitor-facing experience snapshot is published. */
  experienceIsPublished: boolean | null;
  /** False only when the migration's versioned publish API is not installed. */
  versionedSchemaAvailable?: boolean;
}

/**
 * A premium PDF is published once a file locator (the versioned path, or the legacy URL) and
 * its publish time are both set. One rule for the secretary's card and the public pages.
 */
export function isPremiumFilePublished(row: {
  path?: string | null | undefined;
  url?: string | null | undefined;
  at?: string | null | undefined;
}): boolean {
  return Boolean((row.path || row.url) && row.at);
}

export function publishInfoQueryKey(showId: string) {
  return ['shows', showId, 'publish-info'] as const;
}

function isMissingColumn(error: unknown, column: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  if (record.code !== 'PGRST204' && record.code !== '42703') return false;
  return [record.message, record.details, record.hint].some(
    value =>
      typeof value === 'string' && value.includes(column) && /column|schema cache/i.test(value)
  );
}

function isMissingVersionedPublishColumn(error: unknown): boolean {
  return isMissingColumn(error, 'published_premium_path');
}

export async function fetchPublishInfo(showId: string): Promise<PublishInfo> {
  // Direct query bypasses the IndexedDB-replicated show row, which doesn't
  // include the post-189 premium-publish columns. Read-only and cheap.
  const query = (columns: string) =>
    supabase.from('shows').select(columns).eq('id', showId).maybeSingle();
  let versionedSchemaAvailable = true;
  const baseColumns =
    'published_premium_path, published_premium_url, published_premium_at, updated_at, experience_is_published';
  let { data, error } = await query(`${baseColumns}, premium_content_draft_at`);
  // The draft column ships in a migration; before it lands the read must still work.
  if (error && isMissingColumn(error, 'premium_content_draft_at')) {
    ({ data, error } = await query(baseColumns));
  }
  if (error && isMissingVersionedPublishColumn(error)) {
    versionedSchemaAvailable = false;
    ({ data, error } = await query(
      'published_premium_url, published_premium_at, updated_at, experience_is_published'
    ));
  }
  if (error) throw error;
  const row = data as Record<string, unknown> | null;
  const publishedPath = (row?.published_premium_path as string | null) ?? null;
  const legacyPublishedUrl = (row?.published_premium_url as string | null) ?? null;
  const publishedAt = (row?.published_premium_at as string | null) ?? null;
  return {
    publishedLocator: legacyPublishedUrl,
    hasPublishedPremium: isPremiumFilePublished({
      path: publishedPath,
      url: legacyPublishedUrl,
      at: publishedAt,
    }),
    publishedPath,
    publishedAt,
    updatedAt: (row?.updated_at as string | null) ?? null,
    contentDraftSavedAt: (row?.premium_content_draft_at as string | null) ?? null,
    experienceIsPublished: (row?.experience_is_published as boolean | null) ?? null,
    versionedSchemaAvailable,
  };
}

export async function getFreshPremiumDownloadUrl(showId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('get-premium-download', {
    body: { show_id: showId },
  });
  if (error) throw error;
  const url = (data as { url?: unknown } | null)?.url;
  if (typeof url !== 'string' || !url) {
    throw new Error('Premium download returned no URL');
  }
  return url;
}

/**
 * Open the published premium in a new tab. The tab opens synchronously, inside the click, so
 * a pop-up blocker allows it; the short-lived signed URL is fetched after. Resolves false when
 * the tab was blocked or the URL could not be had (the pending tab is then closed).
 */
export async function openPublishedPremium(showId: string): Promise<boolean> {
  const pendingTab = window.open('about:blank', '_blank');
  if (!pendingTab) return false;
  pendingTab.opener = null;
  try {
    pendingTab.location.href = await getFreshPremiumDownloadUrl(showId);
    return true;
  } catch {
    pendingTab.close();
    return false;
  }
}

export function usePublishInfo(showId: string | undefined, canManageShow: boolean) {
  return useQuery({
    queryKey: publishInfoQueryKey(showId ?? ''),
    queryFn: () => fetchPublishInfo(showId!),
    enabled: !!showId && canManageShow,
    // A disabled observer can still expose cached data for its key. Mask the
    // result until the show-management scope is resolved so a transition from
    // manager to non-manager cannot render the previous management state.
    select: data => (canManageShow ? data : undefined),
    // Publish state is show-scoped. The app-wide previous-data placeholder can
    // otherwise make show B render show A's publish state for one frame.
    placeholderData: () => undefined,
    // This query contains only durable show publication metadata, never the
    // expiring signed download URL.
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}
