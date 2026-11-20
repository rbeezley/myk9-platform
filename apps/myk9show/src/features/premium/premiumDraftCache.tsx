import { createContext, useContext, useState, type ReactNode } from 'react';
import type { GeneratedPremium } from '@/types/premium-types';

/**
 * MYK9-2236: what the secretary has done in the premium editor, kept above every place that
 * unmounts it. In Edit show the Premium tab panel unmounts when another tab shows, and the whole
 * form gives way to a skeleton while Save is pending (including while "Publish these premium
 * changes?" waits for an answer). The editor's own state died with it, so the edits were lost
 * and, on a show with no premium yet, a fresh generation ran over them.
 */
export interface PremiumEditorDraft {
  showId: string;
  /** What the editor first held (or last regenerated): the facts and the edit baseline. */
  original: GeneratedPremium;
  supplemental: GeneratedPremium['supplemental'];
  narratives: GeneratedPremium['narratives'];
  generationError: string | null;
  inkSaver: boolean;
}

export interface PremiumDraftCache {
  draft: PremiumEditorDraft | null;
  /** The edit baseline `usePremiumContentEdited` compares against, so a remount is not an edit. */
  loadedKey: string | null;
}

/** The cached draft for this show, or null when there is none to restore. */
export function cachedDraftFor(
  cache: PremiumDraftCache | undefined,
  showId: string
): PremiumEditorDraft | null {
  return cache?.draft?.showId === showId ? cache.draft : null;
}

export function storeDraft(cache: PremiumDraftCache, draft: PremiumEditorDraft): void {
  cache.draft = draft;
}

/**
 * A restored draft keeps the secretary's text and its baseline, but takes the show facts from
 * the fresh premium the tab now offers, so a fact that changed meanwhile is not printed stale.
 * Not across organizations: text written for one must keep its org, so the publish guard that
 * compares it (MYK9-2213) still refuses.
 */
export function withFreshFacts(
  fresh: GeneratedPremium,
  restored: GeneratedPremium
): GeneratedPremium {
  if (fresh.org !== restored.org) return restored;
  return { ...fresh, supplemental: restored.supplemental, narratives: restored.narratives };
}

/** The edit baseline's key: the raw editor state, never the cover-resolved final premium. */
export function premiumEditKey(
  supplemental: GeneratedPremium['supplemental'],
  narratives: GeneratedPremium['narratives']
): string {
  return JSON.stringify([supplemental, narratives]);
}

/** True while the editor holds what it first loaded: nothing in it for Save to keep. */
export function isUneditedDraft(
  cache: PremiumDraftCache,
  supplemental: GeneratedPremium['supplemental'] | null,
  narratives: GeneratedPremium['narratives'] | null
): boolean {
  if (!supplemental || !narratives || cache.loadedKey === null) return true;
  return cache.loadedKey === premiumEditKey(supplemental, narratives);
}

const PremiumDraftCacheContext = createContext<PremiumDraftCache | undefined>(undefined);

/** One cache per Edit show session: the panel remounts the provider each time it opens. */
export function PremiumDraftCacheProvider({ children }: { children: ReactNode }) {
  const [cache] = useState<PremiumDraftCache>(() => ({ draft: null, loadedKey: null }));
  return (
    <PremiumDraftCacheContext.Provider value={cache}>{children}</PremiumDraftCacheContext.Provider>
  );
}

export function usePremiumDraftCache(): PremiumDraftCache | undefined {
  return useContext(PremiumDraftCacheContext);
}
