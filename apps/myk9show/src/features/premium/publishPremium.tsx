import { pdf } from '@react-pdf/renderer';
import { supabase } from '@/services/database/supabaseClient';
import { AKCPremiumTemplate } from './pdf/AKCPremiumTemplate';
import { UKCPremiumTemplate } from './pdf/UKCPremiumTemplate';
import type { GeneratedPremium } from '@/types/premium-types';

const BUCKET = 'premium-published';

/**
 * Render the premium PDF in the browser, upload it to public Storage, and
 * stamp the show row so the exhibitor-facing download link can pick it up.
 *
 * Browser-side render avoids paying the LLM cost on every visitor request —
 * the edge function (which calls Anthropic) runs once per publish, not once
 * per page-load. The public URL we return is stable across re-publishes:
 * the file at `<show_id>.pdf` is overwritten so existing links never break.
 */
export async function publishPremium(
  showId: string,
  premium: GeneratedPremium
): Promise<{ url: string; publishedAt: string }> {
  const Template = premium.org === 'UKC' ? UKCPremiumTemplate : AKCPremiumTemplate;
  const blob = await pdf(<Template premium={premium} />).toBlob();

  const path = `${showId}.pdf`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'application/pdf',
    upsert: true,
    cacheControl: '3600',
  });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const url = urlData.publicUrl;
  const publishedAt = new Date().toISOString();

  // Cast: the new columns land in the generated types after migration 189
  // is applied to the live DB. Until then this bypasses the stale schema.
  const { error: updateError } = await supabase
    .from('shows')
    .update({
      published_premium_url: url,
      published_premium_at: publishedAt,
    } as unknown as Record<string, never>)
    .eq('id', showId);
  if (updateError) throw updateError;

  return { url, publishedAt };
}
