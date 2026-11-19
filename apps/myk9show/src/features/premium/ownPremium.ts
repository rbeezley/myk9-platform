import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { showQueryKeys } from '@/hooks/queries/useShowsDatabase';
import { publicShowDetailQueryKey } from '@/hooks/queries/publicShowDetailQuery';
import { publishInfoQueryKey } from './usePublishInfo';

/**
 * MYK9-2054: a club that publishes its own premium list can hand myK9 the PDF or a link to it.
 * An uploaded PDF is staged in the same private `premium-published` bucket a generated one is,
 * under the same `<showId>/<uuid>.pdf` path the storage policy admits, and committed by
 * `set_own_premium`, so the public page's "Download premium" and `get-premium-download` serve it
 * exactly like a generated PDF. A link is stored on `shows.own_premium_link`.
 */
const BUCKET = 'premium-published';
export const OWN_PREMIUM_MAX_BYTES = 25 * 1024 * 1024;
const MAX_LINK_LENGTH = 2000;

export const OWN_PREMIUM_PDF_ONLY = 'Choose a PDF file.';
export const OWN_PREMIUM_PDF_TOO_LARGE = 'That PDF is over 25 MB. Choose a smaller file.';
export const OWN_PREMIUM_BAD_LINK = 'Enter a web address, like https://yourclub.org/premium.pdf.';
export const OWN_PREMIUM_SAVE_FAILED = 'Could not save your premium list. Try again.';
export const OWN_PREMIUM_REMOVE_FAILED = 'Could not unpublish the premium list. Try again.';

/** The link as stored: http(s) only, no spaces. A bare "club.org/premium.pdf" gets https://. */
export function normalizePremiumLink(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed) || trimmed.length > MAX_LINK_LENGTH) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (!url.hostname.includes('.')) return null;
    return withScheme;
  } catch {
    return null;
  }
}

export function validateOwnPremiumFile(file: File): string | null {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!isPdf) return OWN_PREMIUM_PDF_ONLY;
  if (file.size > OWN_PREMIUM_MAX_BYTES) return OWN_PREMIUM_PDF_TOO_LARGE;
  return null;
}

/** Stage the PDF, then commit it. Throws on any failure; nothing is published until the RPC. */
export async function saveOwnPremiumFile(showId: string, file: File): Promise<void> {
  const invalid = validateOwnPremiumFile(file);
  if (invalid) throw new Error(invalid);
  const path = `${showId}/${crypto.randomUUID()}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    // A PDF-typed blob: a bare `File` keeps its own (possibly empty) MIME type in the multipart
    // body, and set_own_premium requires application/pdf on the stored object.
    .upload(path, new Blob([file], { type: 'application/pdf' }), {
      contentType: 'application/pdf',
      upsert: false,
      cacheControl: '3600',
    });
  if (uploadError) throw uploadError;
  const storageBase = (
    import.meta.env.VITE_SUPABASE_URL || 'https://sojmvhhwsjxmfistvzbe.supabase.co'
  ).replace(/\/$/, '');
  const { error } = await supabase.rpc('set_own_premium', {
    p_show_id: showId,
    p_storage_path: path,
    p_public_url: `${storageBase}/storage/v1/object/public/${BUCKET}/${path}`,
  });
  if (error) throw error;
}

export async function saveOwnPremiumLink(showId: string, link: string): Promise<void> {
  const { error } = await supabase.rpc('set_own_premium', { p_show_id: showId, p_link: link });
  if (error) throw error;
}

/** Takes down the PDF link, the club's own link and the public announcement. Touches no entry. */
export async function unpublishPremium(showId: string): Promise<void> {
  const { error } = await supabase.rpc('unpublish_premium', { p_show_id: showId });
  if (error) throw error;
}

export const ownPremiumLinkQueryKey = (showId: string) =>
  ['shows', showId, 'own-premium-link'] as const;

/**
 * The club's own premium link, read straight off the show row (the replica does not carry it).
 * A failed read is an error, never "no link": the card says it could not check and offers a retry.
 */
export function useOwnPremiumLink(showId: string, enabled: boolean) {
  return useQuery({
    queryKey: ownPremiumLinkQueryKey(showId),
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from('shows')
        .select('own_premium_link')
        .eq('id', showId)
        .maybeSingle();
      if (error) throw error;
      return (data as { own_premium_link?: string | null } | null)?.own_premium_link ?? null;
    },
  });
}

/** After any own-premium write: re-read the publish state, the link and everything under the show. */
export function useRefreshPremiumState(showId: string): () => Promise<void> {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: publishInfoQueryKey(showId) }),
      queryClient.invalidateQueries({ queryKey: ownPremiumLinkQueryKey(showId) }),
      queryClient.invalidateQueries({ queryKey: ['shows', showId] }),
      queryClient.invalidateQueries({ queryKey: showQueryKeys.detail(showId) }),
      queryClient.invalidateQueries({ queryKey: publicShowDetailQueryKey(showId) }),
    ]);
  };
}
