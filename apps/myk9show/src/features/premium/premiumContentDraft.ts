import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import type { GeneratedPremium } from '@/types/premium-types';

/**
 * MYK9-2201: the secretary's premium narrative and supplemental edits, kept on the show
 * (shows.premium_content_draft) until "Republish premium" or a ticked save publishes them.
 */
export type PremiumContentDraft = Pick<GeneratedPremium, 'narratives' | 'supplemental'>;

export interface StoredPremiumContentDraft {
  content: PremiumContentDraft;
  savedAt: string | null;
}

export function premiumContentDraftQueryKey(showId: string) {
  return ['shows', showId, 'premium-content-draft'] as const;
}

export function toPremiumContentDraft(
  premium: Pick<GeneratedPremium, 'narratives' | 'supplemental'>
): PremiumContentDraft {
  return { narratives: premium.narratives, supplemental: premium.supplemental };
}

function isDraft(value: unknown): value is PremiumContentDraft {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.narratives === 'object' &&
    record.narratives !== null &&
    typeof record.supplemental === 'object' &&
    record.supplemental !== null
  );
}

/** Null when no draft is saved. A failed read throws, so callers never mistake it for "none". */
export async function fetchPremiumContentDraft(
  showId: string
): Promise<StoredPremiumContentDraft | null> {
  const { data, error } = await supabase
    .from('shows')
    .select('premium_content_draft, premium_content_draft_at')
    .eq('id', showId)
    .maybeSingle();
  if (error) throw error;
  const row = data as Record<string, unknown> | null;
  const content = row?.premium_content_draft;
  if (!isDraft(content)) return null;
  return { content, savedAt: (row?.premium_content_draft_at as string | null) ?? null };
}

export async function savePremiumContentDraft(
  showId: string,
  draft: PremiumContentDraft
): Promise<void> {
  const { error } = await supabase
    .from('shows')
    .update({ premium_content_draft: draft as never })
    .eq('id', showId);
  if (error) throw error;
}

export function usePremiumContentDraft(showId: string | undefined) {
  return useQuery({
    queryKey: premiumContentDraftQueryKey(showId ?? ''),
    queryFn: () => fetchPremiumContentDraft(showId as string),
    enabled: Boolean(showId),
    // The editor seeds from this once; a stale copy must never replace what is being typed.
    staleTime: 30_000,
  });
}

/** The generated premium with the saved draft's narratives and supplemental fields laid over it. */
export function applyDraftToPremium(
  premium: GeneratedPremium,
  draft: PremiumContentDraft | null | undefined
): GeneratedPremium {
  return draft
    ? { ...premium, narratives: draft.narratives, supplemental: draft.supplemental }
    : premium;
}

/** True when the edited content differs from the baseline (the saved draft, else the published). */
export function premiumContentChanged(
  next: PremiumContentDraft,
  baseline: PremiumContentDraft | null | undefined
): boolean {
  if (!baseline) return true;
  return stableStringify(next) !== stableStringify(toPremiumContentDraft(baseline));
}

// jsonb returns keys in its own order, so compare with sorted keys.
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
        )
      : v
  );
}

/**
 * Keep the secretary's premium edits when the show is saved, ticked publish box or not.
 * Skips the write when nothing changed against the saved draft (or, with none, the published
 * content), so a save that never touched the Premium tab does not make the premium look stale.
 * Returns true when a draft was written.
 */
export async function persistPremiumDraftOnSave(
  showId: string,
  premium: Pick<GeneratedPremium, 'narratives' | 'supplemental'>,
  published: PremiumContentDraft | null | undefined
): Promise<boolean> {
  let baseline: PremiumContentDraft | null | undefined = published;
  try {
    baseline = (await fetchPremiumContentDraft(showId))?.content ?? published;
  } catch {
    // An unreadable draft cannot prove "unchanged"; fall through and save.
    baseline = null;
  }
  const next = withoutInlineCover(toPremiumContentDraft(premium), baseline);
  if (!premiumContentChanged(next, baseline)) return false;
  await savePremiumContentDraft(showId, next);
  return true;
}

// The editor swaps the cover for an inline data: copy so the PDF can render it. That copy is
// megabytes and never a storable locator, so the draft keeps the last stored cover URL.
function withoutInlineCover(
  draft: PremiumContentDraft,
  baseline: PremiumContentDraft | null | undefined
): PremiumContentDraft {
  const cover = draft.supplemental.coverImageUrl;
  if (typeof cover !== 'string' || !cover.startsWith('data:')) return draft;
  return {
    ...draft,
    supplemental: {
      ...draft.supplemental,
      coverImageUrl: baseline?.supplemental.coverImageUrl ?? null,
    },
  };
}
