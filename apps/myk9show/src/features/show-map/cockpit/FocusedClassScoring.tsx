import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  setClassScoresOnPaper,
  setClassesScoreOnPaper,
} from '@/services/show-day/classScoringMutations';
import { SCORING_COPY, isClassOnPaper, type JudgeScoringState } from './classScoringModel';

/** Two one-tap choices, the current one pressed. Both are 44px targets. */
function ScoringChoice({
  label,
  paper,
  phone,
  busy,
  onChoose,
}: {
  label: string;
  /** Whether the paper / phone choice is the current state. */
  paper: boolean;
  phone: boolean;
  busy: boolean;
  onChoose: (onPaper: boolean) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant={paper ? 'default' : 'outline'}
        aria-pressed={paper}
        disabled={busy}
        className="min-h-11"
        onClick={() => onChoose(true)}
      >
        {SCORING_COPY.paper}
      </Button>
      <Button
        type="button"
        variant={phone ? 'default' : 'outline'}
        aria-pressed={phone}
        disabled={busy}
        className="min-h-11"
        onClick={() => onChoose(false)}
      >
        {SCORING_COPY.phone}
      </Button>
    </div>
  );
}

/**
 * The Show Desk class panel's scoring switch (MYK9-1971): one tap, no confirmation, writes the
 * class's own `scores_on_paper` through the replicated classes table. The class's claim state
 * follows on this device at once and on others after sync.
 */
export function ClassScoringSwitch({
  classId,
  className,
  scoresOnPaper,
  showUsesDeviceScoring,
}: {
  classId: string;
  className: string;
  scoresOnPaper: boolean | null | undefined;
  showUsesDeviceScoring: boolean | null | undefined;
}) {
  const [busy, setBusy] = useState(false);
  const onPaper = isClassOnPaper(scoresOnPaper, showUsesDeviceScoring);
  const choose = async (next: boolean) => {
    if (next === onPaper) return;
    setBusy(true);
    try {
      await setClassScoresOnPaper(classId, next);
    } catch {
      toast.error(SCORING_COPY.failed);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ScoringChoice
      label={`${SCORING_COPY.fieldLabel} for ${className}`}
      paper={onPaper}
      phone={!onPaper}
      busy={busy}
      onChoose={next => void choose(next)}
    />
  );
}

/**
 * Where the secretary assigns a judge (the class panel's Judge field), one choice for every class
 * that judge has (MYK9-1971). It writes each class's `scores_on_paper`; nothing is stored on the
 * judge, so a class assigned later follows the show's setting, and the hint says so.
 */
export function JudgeScoringChoice({
  judgeName,
  state,
  classIds,
}: {
  judgeName: string;
  state: JudgeScoringState;
  classIds: readonly string[];
}) {
  const [busy, setBusy] = useState(false);
  const choose = async (onPaper: boolean) => {
    if (state === (onPaper ? 'paper' : 'phone')) return;
    setBusy(true);
    try {
      await setClassesScoreOnPaper(classIds, onPaper);
    } catch {
      toast.error(SCORING_COPY.failed);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-2 space-y-1">
      <ScoringChoice
        label={SCORING_COPY.judgeGroupLabel(judgeName)}
        paper={state === 'paper'}
        phone={state === 'phone'}
        busy={busy}
        onChoose={next => void choose(next)}
      />
      <p className="text-xs text-muted-foreground">
        {state === 'mixed' ? `${SCORING_COPY.mixed} ` : ''}
        {SCORING_COPY.judgeHint}
      </p>
    </div>
  );
}
