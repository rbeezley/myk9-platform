import { publishPremium } from '@/features/premium/publishPremium';
import { supabase } from '@/services/database/supabaseClient';
import type { GeneratedPremium } from '@/types/premium-types';
import { buildExperienceSnapshot } from './experienceSnapshot';

export async function publishExperience({
  showId,
  premium,
  inkSaver,
}: {
  showId: string;
  premium: GeneratedPremium;
  inkSaver: boolean;
}): Promise<{ publishedAt: string; premiumUrl: string }> {
  const premiumResult = await publishPremium(showId, premium, { inkSaver });
  const snapshot = buildExperienceSnapshot({
    premium,
    premiumUrl: premiumResult.url,
    publishedAt: premiumResult.publishedAt,
  });

  const { error } = await supabase
    .from('shows')
    .update({
      experience_is_published: true,
      experience_published_at: premiumResult.publishedAt,
      experience_published_style: premium.style,
      experience_published_content: snapshot,
    } as unknown as Record<string, never>)
    .eq('id', showId);

  if (error) throw error;

  return { publishedAt: premiumResult.publishedAt, premiumUrl: premiumResult.url };
}
