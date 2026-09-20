import { pdf } from '@react-pdf/renderer';
import { supabase } from '@/services/database/supabaseClient';
import { AKCPremiumTemplate } from './pdf/AKCPremiumTemplate';
import { UKCPremiumTemplate } from './pdf/UKCPremiumTemplate';
import type { GeneratedPremium } from '@/types/premium-types';
import { classifyPremiumPublishError } from './premiumPublishErrors';

const BUCKET = 'premium-published';

export interface PublishPremiumOptions {
  inkSaver?: boolean;
  /** Stable for one publish attempt so an atomic commit can be retried. */
  artifactId?: string;
  publishedAt?: string;
}

export interface StagedPremiumArtifact {
  path: string;
  url: string;
  publishedAt: string;
}

/**
 * Render the premium PDF in the browser and stage it in public Storage.
 * Database publication is deliberately performed by publishExperience's
 * atomic RPC after the complete snapshot has been built.
 *
 * Browser-side render avoids paying the LLM cost on every visitor request —
 * the edge function (which calls Anthropic) runs once per publish, not once
 * per page-load. Each staged artifact is immutable, so a failed republish
 * cannot replace the last-good public bytes.
 */
export async function publishPremium(
  showId: string,
  premium: GeneratedPremium,
  opts?: PublishPremiumOptions
): Promise<StagedPremiumArtifact> {
  const Template = premium.org === 'UKC' ? UKCPremiumTemplate : AKCPremiumTemplate;
  const inkSaver = opts?.inkSaver ?? false;

  // Render and upload BEFORE updating DB columns. A failed render must not
  // invalidate the previously-published premium.
  let blob: Blob;
  try {
    blob = await pdf(<Template premium={premium} inkSaver={inkSaver} />).toBlob();
  } catch (err) {
    console.error('[premium-publish] PDF render failed', {
      showId,
      style: premium.style,
      org: premium.org,
      inkSaver,
      error: err instanceof Error ? err.message : String(err),
    });
    throw classifyPremiumPublishError(err, 'pdf-render');
  }

  const artifactId = opts?.artifactId ?? crypto.randomUUID();
  const path = `${showId}/${artifactId}.pdf`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'application/pdf',
    upsert: false,
    cacheControl: '3600',
  });
  if (uploadError && !isAlreadyStagedError(uploadError)) {
    console.error('[premium-publish] PDF upload failed', { showId, path, error: uploadError });
    throw classifyPremiumPublishError(uploadError, 'pdf-upload');
  }
  if (uploadError) {
    console.info('[premium-publish] PDF artifact already staged; retrying its commit', {
      showId,
      path,
    });
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const url = urlData.publicUrl;
  return { path, url, publishedAt: opts?.publishedAt ?? new Date().toISOString() };
}

function isAlreadyStagedError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: unknown }).message ?? '')
        : String(error ?? '');
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status?: unknown }).status)
      : undefined;
  const statusCode =
    typeof error === 'object' && error !== null && 'statusCode' in error
      ? Number((error as { statusCode?: unknown }).statusCode)
      : undefined;
  return (
    status === 409 ||
    statusCode === 409 ||
    /already exists|duplicate|already uploaded/i.test(message)
  );
}
