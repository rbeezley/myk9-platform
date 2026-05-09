import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import type { ShowExperienceSnapshot } from './experienceSnapshot';

async function fetchPublishedExperienceContent(
  showId: string
): Promise<ShowExperienceSnapshot | null> {
  const { data, error } = await supabase
    .from('shows')
    .select('experience_is_published, experience_published_content')
    .eq('id', showId)
    .maybeSingle();

  if (error) throw error;
  const row = data as Record<string, unknown> | null;
  if (!row?.experience_is_published) return null;
  return (row.experience_published_content as ShowExperienceSnapshot | null) ?? null;
}

export function usePublishedExperienceContent(showId: string | undefined) {
  return useQuery({
    queryKey: ['shows', showId, 'published-experience-content'],
    queryFn: () => fetchPublishedExperienceContent(showId as string),
    enabled: Boolean(showId),
    staleTime: 30_000,
  });
}
