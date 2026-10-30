/**
 * Leaving a scoresheet (MYK9-1500): the Up control and the bottom Cancel both
 * go through `requestLeave`. An untouched sheet leaves at once; a sheet with a
 * run timer, a chosen result or a typed time asks "Discard this score?" first.
 * No draft persistence: Discard throws the score away.
 */
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Button, Card } from '@myk9/ui';
import type { ScoresheetScoringReturn } from './useScoresheetScoring';

interface StopwatchLike {
  isRunning: boolean;
  getTimeMs: () => number;
}

export interface UseScoresheetLeaveOptions {
  scoring: ScoresheetScoringReturn;
  /** Omit for sheets without a run timer. */
  stopwatch?: StopwatchLike;
  /** Sport-specific result input the shared scoring state does not hold. */
  extraDirty?: () => boolean;
  onBack: () => void;
}

export function DiscardScoreDialog({
  onKeep,
  onDiscard,
}: {
  onKeep: () => void;
  onDiscard: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      data-testid="discard-score-dialog"
    >
      <Card
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="discard-score-title"
        className="w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95"
      >
        <h2 id="discard-score-title" className="text-xl font-semibold">
          Discard this score?
        </h2>
        <p className="text-sm text-muted-foreground">
          The time or result you entered for this dog has not been saved.
        </p>
        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1 h-12" onClick={onKeep}>
            Keep scoring
          </Button>
          <Button variant="destructive" className="flex-1 h-12" onClick={onDiscard}>
            Discard
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function useScoresheetLeave({
  scoring,
  stopwatch,
  extraDirty,
  onBack,
}: UseScoresheetLeaveOptions): { requestLeave: () => void; discardDialog: ReactNode } {
  const [asking, setAsking] = useState(false);
  // What the sheet opened with, so re-editing a saved score is not "dirty" until changed.
  const initial = useRef({
    qualifying: scoring.qualifying,
    times: scoring.areas.map(a => a.time).join('|'),
  });

  const requestLeave = useCallback(() => {
    const timerRan = Boolean(stopwatch && (stopwatch.isRunning || stopwatch.getTimeMs() > 0));
    const dirty =
      timerRan ||
      scoring.qualifying !== initial.current.qualifying ||
      scoring.areas.map(a => a.time).join('|') !== initial.current.times ||
      Boolean(extraDirty?.());
    if (dirty) setAsking(true);
    else onBack();
  }, [stopwatch, scoring, extraDirty, onBack]);

  const discardDialog = asking ? (
    <DiscardScoreDialog onKeep={() => setAsking(false)} onDiscard={onBack} />
  ) : null;

  return { requestLeave, discardDialog };
}
