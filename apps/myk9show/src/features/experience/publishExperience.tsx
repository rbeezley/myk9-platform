import { publishPremium } from '@/features/premium/publishPremium';
import { supabase } from '@/services/database/supabaseClient';
import type { GeneratedPremium } from '@/types/premium-types';
import { buildExperienceSnapshot } from './experienceSnapshot';
import { classifyPremiumPublishError } from '@/features/premium/premiumPublishErrors';

export async function publishExperience({
  showId,
  premium,
  inkSaver,
  artifactId,
  publishedAt,
  publishVersion,
}: {
  showId: string;
  premium: GeneratedPremium;
  inkSaver: boolean;
  artifactId?: string;
  publishedAt?: string;
  publishVersion: number;
}): Promise<{ publishedAt: string; premiumUrl: string }> {
  const premiumResult = await publishPremium(showId, premium, {
    inkSaver,
    ...(artifactId ? { artifactId } : {}),
    ...(publishedAt ? { publishedAt } : {}),
  });
  const snapshot = buildExperienceSnapshot({
    premium,
    premiumPath: premiumResult.path,
    publishedAt: premiumResult.publishedAt,
  });

  const { data, error } = await (supabase as unknown as PremiumPublishRpcClient).rpc(
    'publish_premium_artifact',
    {
      p_show_id: showId,
      p_storage_path: premiumResult.path,
      p_publish_version: publishVersion,
      p_experience_style: premium.style,
      p_experience_content: snapshot,
    }
  );

  if (error) {
    console.error('[premium-publish] experience snapshot update failed', { showId, error });
    throw classifyPremiumPublishError(error, 'experience-snapshot');
  }

  if (!data || (Array.isArray(data) && data.length === 0)) {
    const noRowsError = new Error('Premium publication committed zero show rows');
    console.error('[premium-publish] atomic publication returned no show row', { showId });
    throw classifyPremiumPublishError(noRowsError, 'experience-snapshot');
  }

  return {
    publishedAt: getCommittedPublishedAt(data) ?? premiumResult.publishedAt,
    premiumUrl: premiumResult.url,
  };
}

function getCommittedPublishedAt(data: unknown): string | null {
  if (!data || typeof data !== 'object' || !('publishedAt' in data)) return null;
  const publishedAt = (data as { publishedAt?: unknown }).publishedAt;
  return typeof publishedAt === 'string' ? publishedAt : null;
}

interface PremiumPublishRpcClient {
  rpc: (
    functionName: 'publish_premium_artifact',
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: unknown | null }>;
}
