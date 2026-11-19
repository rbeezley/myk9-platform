import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { fetchPublishedExperienceContent } from '@/features/experience/usePublishedExperienceContent';
import type { GeneratedPremium } from '@/types/premium-types';

type Narratives = GeneratedPremium['narratives'];
type Supplemental = GeneratedPremium['supplemental'];

/**
 * MYK9-2201: the secretary's premium edits, kept in show_premium_drafts (managers only) until
 * "Republish premium" or a ticked save publishes them. `content` holds ONLY the fields that differ
 * from the published snapshot, so text the club template later changes is not frozen by a save.
 */
export interface PremiumContentDraft {
  narratives?: Partial<Narratives>;
  supplemental?: Partial<Supplemental>;
}

export interface StoredPremiumContentDraft {
  content: PremiumContentDraft;
  savedAt: string | null;
}

export type PremiumDraftSaveResult = 'saved' | 'unchanged' | 'unsaved';

export function premiumContentDraftQueryKey(showId: string) {
  return ['shows', showId, 'premium-content-draft'] as const;
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

export function isPremiumDraftEmpty(draft: PremiumContentDraft | null | undefined): boolean {
  return (
    !draft ||
    (Object.keys(draft.narratives ?? {}).length === 0 &&
      Object.keys(draft.supplemental ?? {}).length === 0)
  );
}

function isInlineCover(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith('data:');
}

/**
 * The fields of `edited` that differ from `base` (the published snapshot; null when never
 * published, so everything counts). A cover is stored only when it is a real URL, never null and
 * never the editor's inline copy.
 */
export function diffPremiumContent(
  edited: Pick<GeneratedPremium, 'narratives' | 'supplemental'>,
  base: Pick<GeneratedPremium, 'narratives' | 'supplemental'> | null
): PremiumContentDraft {
  const narratives: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(edited.narratives)) {
    const baseValue = (base?.narratives as Record<string, unknown> | undefined)?.[key];
    if (stableStringify(value) !== stableStringify(baseValue)) narratives[key] = value;
  }
  const supplemental: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(edited.supplemental)) {
    if (key === 'coverImageUrl' && (!value || isInlineCover(value))) continue;
    const baseValue = (base?.supplemental as Record<string, unknown> | undefined)?.[key];
    if (stableStringify(value) !== stableStringify(baseValue)) supplemental[key] = value;
  }
  return {
    ...(Object.keys(narratives).length > 0
      ? { narratives: narratives as Partial<Narratives> }
      : {}),
    ...(Object.keys(supplemental).length > 0
      ? { supplemental: supplemental as Partial<Supplemental> }
      : {}),
  };
}

/** The premium with the draft's changed fields laid over it. A null cover never overlays. */
export function overlayPremiumContent<
  T extends Pick<GeneratedPremium, 'narratives' | 'supplemental'>,
>(premium: T, draft: PremiumContentDraft | null | undefined): T {
  if (!draft) return premium;
  const { coverImageUrl, ...supplemental } = draft.supplemental ?? {};
  return {
    ...premium,
    narratives: { ...premium.narratives, ...draft.narratives },
    supplemental: {
      ...premium.supplemental,
      ...supplemental,
      ...(coverImageUrl && !isInlineCover(coverImageUrl) ? { coverImageUrl } : {}),
    },
  };
}

function isDraftContent(value: unknown): value is PremiumContentDraft {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Null when no draft is saved. A failed read throws, so callers never mistake it for "none". */
export async function fetchPremiumContentDraft(
  showId: string
): Promise<StoredPremiumContentDraft | null> {
  const { data, error } = await supabase
    .from('show_premium_drafts' as never)
    .select('content, saved_at')
    .eq('show_id', showId)
    .maybeSingle();
  if (error) throw error;
  const row = data as Record<string, unknown> | null;
  if (!row || !isDraftContent(row.content)) return null;
  return { content: row.content, savedAt: (row.saved_at as string | null) ?? null };
}

export async function savePremiumContentDraft(
  showId: string,
  content: PremiumContentDraft
): Promise<void> {
  const { error } = await supabase
    .from('show_premium_drafts' as never)
    .upsert({ show_id: showId, content } as never, { onConflict: 'show_id' });
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

/** True for an offline browser or a failed request, which the premium's online-only design allows. */
export function isNetworkFailure(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (error instanceof TypeError) return true;
  const message =
    error instanceof Error ? error.message : (error as { message?: unknown })?.message;
  return typeof message === 'string' && /failed to fetch|network|load failed/i.test(message);
}

/**
 * Keep the secretary's premium edits when the show is saved, ticked publish box or not.
 * The baseline is the published snapshot, read from the server. When that cannot be read (or the
 * existing draft cannot), nothing is written and the result is 'unsaved': an unread baseline is
 * not proof that anything changed. A write that fails throws.
 */
export async function persistPremiumDraftOnSave(
  showId: string,
  premium: Pick<GeneratedPremium, 'narratives' | 'supplemental'>
): Promise<PremiumDraftSaveResult> {
  let existing: StoredPremiumContentDraft | null;
  let diff: PremiumContentDraft;
  try {
    const base = await fetchPublishedExperienceContent(showId);
    diff = diffPremiumContent(premium, base);
    existing = await fetchPremiumContentDraft(showId);
  } catch {
    return 'unsaved';
  }
  const before = existing?.content ?? {};
  if (
    stableStringify(diff) === stableStringify(before) ||
    (!existing && isPremiumDraftEmpty(diff))
  ) {
    return 'unchanged';
  }
  await savePremiumContentDraft(showId, diff);
  return 'saved';
}
