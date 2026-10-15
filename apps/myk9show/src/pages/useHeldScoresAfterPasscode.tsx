import { useCallback, useRef, useState, type ReactNode } from 'react';
import { HeldRingsideScoresDialog } from '@/features/at-show/HeldRingsideScores';
import {
  adoptHeldRingsideScores,
  countHeldRingsideScores,
} from '@/services/replication/heldRingsideScores';
import { logger } from '@/utils/logger';

/**
 * After a passcode validates online (MYK9-1205): if an earlier session on this
 * device left scores queued for this show, ask whether to upload them before
 * going to the ring. `offer` resolves true when it asked, in which case the
 * dialog owns the navigation (`proceed` runs after either answer, once). "Not
 * now" leaves the scores held; the at-show screen then explains them.
 */
export function useHeldScoresAfterPasscode(proceed: (showId: string) => void): {
  offer: (showId: string) => Promise<boolean>;
  dialog: ReactNode;
} {
  const [prompt, setPrompt] = useState<{ showId: string; count: number } | null>(null);
  const settledRef = useRef(true);

  const offer = useCallback(async (showId: string) => {
    const count = await countHeldRingsideScores();
    if (count === 0) return false;
    settledRef.current = false;
    setPrompt({ showId, count });
    return true;
  }, []);

  const settle = (showId: string, adopt: boolean) => {
    if (settledRef.current) return;
    settledRef.current = true;
    setPrompt(null);
    if (!adopt) {
      proceed(showId);
      return;
    }
    void adoptHeldRingsideScores()
      .catch(error =>
        logger.error('[sign-in] adopting held scores failed', 'at-show', { error: String(error) })
      )
      .then(() => proceed(showId));
  };

  const dialog = prompt ? (
    <HeldRingsideScoresDialog
      open
      count={prompt.count}
      onOpenChange={open => {
        if (!open) settle(prompt.showId, false);
      }}
      onConfirm={() => settle(prompt.showId, true)}
    />
  ) : null;

  return { offer, dialog };
}
