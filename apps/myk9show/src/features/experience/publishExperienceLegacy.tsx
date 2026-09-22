import { supabase } from '@/services/database/supabaseClient';
import { renderPremiumPdf } from '@/features/premium/publishPremium';
import { classifyPremiumPublishError } from '@/features/premium/premiumPublishErrors';
import type { PremiumPublishIntent } from '@/features/premium/premiumPublishIntent';
import { buildExperienceSnapshot } from './experienceSnapshot';

const BUCKET = 'premium-published';

/** Temporary expand/contract adapter for a new app talking to the old schema. */
export async function publishExperienceLegacy({
  showId,
  intent,
}: {
  showId: string;
  intent: PremiumPublishIntent;
}): Promise<{ publishedAt: string; premiumUrl: string }> {
  const { premium, inkSaver } = intent;
  const blob = await renderPremiumPdf(showId, premium, inkSaver);
  const path = `${showId}.pdf`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'application/pdf',
    upsert: true,
    cacheControl: '3600',
  });
  if (uploadError) {
    console.error('[premium-publish] legacy PDF upload failed', { showId, error: uploadError });
    throw classifyPremiumPublishError(uploadError, 'pdf-upload');
  }

  const premiumUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const publishedAt = new Date().toISOString();
  const { error: metadataError } = await supabase
    .from('shows')
    .update({
      published_premium_url: premiumUrl,
      published_premium_at: publishedAt,
    } as unknown as Record<string, never>)
    .eq('id', showId);
  if (metadataError) {
    console.error('[premium-publish] legacy premium metadata update failed', {
      showId,
      error: metadataError,
    });
    throw classifyPremiumPublishError(metadataError, 'premium-metadata');
  }

  const snapshot = buildExperienceSnapshot({
    premium,
    premiumPath: null,
    premiumUrl,
    publishedAt,
  });
  const { error: experienceError } = await supabase
    .from('shows')
    .update({
      experience_is_published: true,
      experience_published_at: publishedAt,
      experience_published_style: premium.style,
      experience_published_content: snapshot,
    } as unknown as Record<string, never>)
    .eq('id', showId);
  if (experienceError) {
    console.error('[premium-publish] legacy experience update failed', {
      showId,
      error: experienceError,
    });
    throw classifyPremiumPublishError(experienceError, 'experience-snapshot');
  }

  return { publishedAt, premiumUrl };
}
