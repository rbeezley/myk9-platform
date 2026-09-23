import { publishPremium } from '@/features/premium/publishPremium';
import type { PremiumPublishAttempt } from '@/features/premium/premiumPublishIntent';
import { supabase } from '@/services/database/supabaseClient';
import { classifyPremiumPublishError } from '@/features/premium/premiumPublishErrors';
import { buildExperienceSnapshot } from './experienceSnapshot';

export async function publishExperience({
  showId,
  attempt,
}: {
  showId: string;
  attempt: PremiumPublishAttempt;
}): Promise<{ publishedAt: string; premiumUrl: string }> {
  const { premium, inkSaver } = attempt.intent;
  const staged = await publishPremium(showId, premium, {
    artifactId: attempt.artifactId,
    inkSaver,
  });
  // The legacy URL column remains part of the commit identity, but private
  // Storage is only downloadable through the committed-pointer endpoint.
  const storageBase = (
    import.meta.env.VITE_SUPABASE_URL || 'https://sojmvhhwsjxmfistvzbe.supabase.co'
  ).replace(/\/$/, '');
  const premiumUrl = `${storageBase}/storage/v1/object/public/premium-published/${staged.path}`;
  const snapshot = buildExperienceSnapshot({
    premium,
    premiumPath: staged.path,
    premiumUrl,
  });

  const { data, error } = await (supabase as unknown as PremiumPublishRpcClient).rpc(
    'publish_premium_artifact',
    {
      p_show_id: showId,
      p_storage_path: staged.path,
      p_public_url: premiumUrl,
      p_publish_version: attempt.publishVersion,
      p_experience_style: premium.style,
      p_experience_content: snapshot,
    }
  );

  if (error) {
    console.error('[premium-publish] experience snapshot update failed', { showId, error });
    throw classifyPremiumPublishError(error, 'experience-snapshot');
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    const invalidResponse = new Error('Premium publication returned an invalid result');
    console.error('[premium-publish] atomic publication returned an invalid result', { showId });
    throw classifyPremiumPublishError(invalidResponse, 'experience-snapshot');
  }

  const committed = data as { publishedAt?: unknown; premiumUrl?: unknown };
  if (typeof committed.publishedAt !== 'string' || typeof committed.premiumUrl !== 'string') {
    const incompleteResponse = new Error('Premium publication returned incomplete metadata');
    console.error('[premium-publish] atomic publication returned incomplete metadata', { showId });
    throw classifyPremiumPublishError(incompleteResponse, 'experience-snapshot');
  }

  return { publishedAt: committed.publishedAt, premiumUrl: committed.premiumUrl };
}

interface PremiumPublishRpcClient {
  rpc: (
    functionName: 'publish_premium_artifact',
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: unknown | null }>;
}
