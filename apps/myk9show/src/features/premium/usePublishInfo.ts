import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';

export interface PublishInfo {
  /** Stored locator for state/staleness only; never use as a download href. */
  publishedLocator: string | null;
  hasPublishedPremium: boolean;
  publishedPath?: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  /** Whether the exhibitor-facing experience snapshot is published. */
  experienceIsPublished: boolean | null;
  /** False only when the migration's versioned publish API is not installed. */
  versionedSchemaAvailable?: boolean;
}

export function publishInfoQueryKey(showId: string) {
  return ['shows', showId, 'publish-info'] as const;
}

function isMissingVersionedPublishColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  if (record.code !== 'PGRST204' && record.code !== '42703') return false;
  return [record.message, record.details, record.hint].some(
    value =>
      typeof value === 'string' &&
      value.includes('published_premium_path') &&
      /column|schema cache/i.test(value)
  );
}

export async function fetchPublishInfo(showId: string): Promise<PublishInfo> {
  // Direct query bypasses the IndexedDB-replicated show row, which doesn't
  // include the post-189 premium-publish columns. Read-only and cheap.
  const query = (columns: string) =>
    supabase.from('shows').select(columns).eq('id', showId).maybeSingle();
  let versionedSchemaAvailable = true;
  let { data, error } = await query(
    'published_premium_path, published_premium_url, published_premium_at, updated_at, experience_is_published'
  );
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
    hasPublishedPremium: Boolean((publishedPath || legacyPublishedUrl) && publishedAt),
    publishedPath,
    publishedAt,
    updatedAt: (row?.updated_at as string | null) ?? null,
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
