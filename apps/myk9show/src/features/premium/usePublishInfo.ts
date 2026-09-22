import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';

export interface PublishInfo {
  publishedUrl: string | null;
  publishedPath?: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  /** Whether the exhibitor-facing experience snapshot is published. */
  experienceIsPublished: boolean | null;
}

export function publishInfoQueryKey(showId: string) {
  return ['shows', showId, 'publish-info'] as const;
}

function isMissingVersionedPublishColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  if (record.code !== 'PGRST204') return false;
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
  let { data, error } = await query(
    'published_premium_path, published_premium_url, published_premium_at, updated_at, experience_is_published'
  );
  if (error && isMissingVersionedPublishColumn(error)) {
    ({ data, error } = await query(
      'published_premium_url, published_premium_at, updated_at, experience_is_published'
    ));
  }
  if (error) throw error;
  const row = data as Record<string, unknown> | null;
  const publishedPath = (row?.published_premium_path as string | null) ?? null;
  const legacyPublishedUrl = (row?.published_premium_url as string | null) ?? null;
  const publishedUrl = publishedPath
    ? supabase.storage.from('premium-published').getPublicUrl(publishedPath).data.publicUrl
    : legacyPublishedUrl;
  return {
    publishedUrl,
    publishedPath,
    publishedAt: (row?.published_premium_at as string | null) ?? null,
    updatedAt: (row?.updated_at as string | null) ?? null,
    experienceIsPublished: (row?.experience_is_published as boolean | null) ?? null,
  };
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
    staleTime: 30_000,
  });
}
