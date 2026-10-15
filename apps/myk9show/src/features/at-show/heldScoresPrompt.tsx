import { useNavigate } from 'react-router-dom';
import { create } from 'zustand';
import {
  adoptHeldRingsideScores,
  countHeldRingsideScores,
} from '@/services/replication/heldRingsideScores';
import { logger } from '@/utils/logger';
import { HeldRingsideScoresDialog } from './HeldRingsideScores';

/**
 * The "upload earlier scores?" question after a passcode validates (MYK9-1205).
 *
 * It lives in a store and is rendered by `HeldScoresPromptHost`, mounted once at
 * the app root, NOT in the sign-in page: on /at-show the anonymous sign-in
 * itself swaps the page (RingsideEntryPage stops rendering SmartSignInPage), so a
 * prompt owned by that page would unmount mid-question. The host also owns the
 * navigation to the show, which therefore happens after either answer, once.
 */
interface HeldScoresPromptState {
  prompt: { showId: string; count: number } | null;
  setPrompt: (prompt: { showId: string; count: number } | null) => void;
}

export const useHeldScoresPromptStore = create<HeldScoresPromptState>(set => ({
  prompt: null,
  setPrompt: prompt => set({ prompt }),
}));

/** Resolves true when it asked: the host then navigates; the caller must not. */
export async function offerHeldScoresAfterPasscode(showId: string): Promise<boolean> {
  const count = await countHeldRingsideScores();
  if (count === 0) return false;
  useHeldScoresPromptStore.getState().setPrompt({ showId, count });
  return true;
}

export function HeldScoresPromptHost() {
  const prompt = useHeldScoresPromptStore(state => state.prompt);
  const navigate = useNavigate();
  if (!prompt) return null;

  const settle = (adopt: boolean) => {
    // Clear first and synchronously: confirm also fires onOpenChange(false).
    if (useHeldScoresPromptStore.getState().prompt !== prompt) return;
    useHeldScoresPromptStore.getState().setPrompt(null);
    const go = () => navigate(`/at-show/${prompt.showId}`);
    if (!adopt) {
      go();
      return;
    }
    void adoptHeldRingsideScores(prompt.showId)
      .catch(error =>
        logger.error('[sign-in] adopting held scores failed', 'at-show', { error: String(error) })
      )
      .then(go);
  };

  return (
    <HeldRingsideScoresDialog
      open
      count={prompt.count}
      onOpenChange={open => {
        if (!open) settle(false);
      }}
      onConfirm={() => settle(true)}
    />
  );
}
