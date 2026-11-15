/**
 * The line at the top of the entry list after a confirmed save (MYK9-2012):
 * "Saved: 100 Willow · Qualified · 0:04.35 · Correct". Offline or not yet
 * uploaded it adds "on this device, not sent yet".
 *
 * It is rendered as the last row INSIDE the entry list's sticky header (the `banner` slot), so it
 * stays in view when the list returns to a scrolled position, and never covers the header's
 * controls (MYK9-2012).
 *
 * INTENT: this says what was saved and offers Correct. It never names, ranks or
 * suggests another dog (see `savedScore.ts`). Correct is the same reopen as the
 * old "Correct this score": the scoresheet route reads the saved row from the
 * device and pre-fills it (MYK9-1025, MYK9-1106), so it never waits on the
 * network.
 */

import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSavedScoreStore, type SavedScore } from './savedScore';
import { useScoreSaveState, useScoresSentToast } from './useScoreSaveState';

export const SavedScoreLine: React.FC = () => {
  const saved = useSavedScoreStore(state => state.saved);
  const { pathname } = useLocation();
  if (!saved || saved.listPath !== pathname) return null;
  return <SavedScoreLineBody saved={saved} />;
};

const SavedScoreLineBody: React.FC<{ saved: SavedScore }> = ({ saved }) => {
  const navigate = useNavigate();
  const clearScroll = useSavedScoreStore(store => store.clearScroll);
  // Back from the sheet lands on the list entry the dog was opened from: put the list back where
  // it was, once, so the dog just scored is not where the screen jumps to (MYK9-2012).
  const { scrollY } = saved;
  useEffect(() => {
    if (!scrollY) return;
    const frame = requestAnimationFrame(() => {
      window.scrollTo(0, scrollY);
      clearScroll();
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollY, clearScroll]);
  const { state, sawQueued } = useScoreSaveState(saved.entryId);
  useScoresSentToast(state, sawQueued);

  const parts = [saved.dogLabel, saved.resultLabel, saved.timeLabel].filter(Boolean).join(' · ');
  const failed = state === 'failed';
  const note =
    state === 'acknowledged'
      ? null
      : failed
        ? 'could not be sent, needs attention'
        : 'on this device, not sent yet';

  return (
    <div
      role="status"
      data-testid="saved-score-line"
      className={`flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border px-3 py-2 text-sm ${
        failed ? 'text-destructive' : 'text-foreground'
      }`}
    >
      {failed ? (
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <span>
        <span className="font-medium">Saved:</span> {parts}
        {note ? ` · ${note}` : ''}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-9"
        onClick={() => navigate(saved.scoreRoute, { state: { returnScrollY: window.scrollY } })}
      >
        Correct
      </Button>
    </div>
  );
};
