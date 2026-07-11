import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';

export interface PublishInfo {
  publishedUrl: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
}

export function publishInfoQueryKey(showId: string) {
  return ['shows', showId, 'publish-info'] as const;
}

export async function fetchPublishInfo(showId: string): Promise<PublishInfo> {
  // Direct query bypasses the IndexedDB-replicated show row, which doesn't
  // include the post-189 premium-publish columns. Read-only and cheap.
  const { data, error } = await supabase
    .from('shows')
    .select('published_premium_url, published_premium_at, updated_at')
    .eq('id', showId)
    .maybeSingle();
  if (error) throw error;
  const row = data as Record<string, unknown> | null;
  return {
    publishedUrl: (row?.published_premium_url as string | null) ?? null,
    publishedAt: (row?.published_premium_at as string | null) ?? null,
    updatedAt: (row?.updated_at as string | null) ?? null,
  };
}

export function usePublishInfo(showId: string | undefined) {
  return useQuery({
    queryKey: publishInfoQueryKey(showId ?? ''),
    queryFn: () => fetchPublishInfo(showId!),
    enabled: !!showId,
    staleTime: 30_000,
  });
}
