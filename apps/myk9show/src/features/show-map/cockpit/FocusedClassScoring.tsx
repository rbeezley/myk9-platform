import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  setClassScoresOnPaper,
  setClassesScoreOnPaper,
} from '@/services/show-day/classScoringMutations';
import {
  SCORING_COPY,
  isClassOnPaper,
  showUsualWay,
  type JudgeScoringModel,
} from './classScoringModel';

/** Long labels ("... (the show's usual way)") wrap on a 375px phone; min-h-11 keeps the 44px target. */
const SCORING_BUTTON_CLASS = 'h-auto min-h-11 whitespace-normal text-left';

/** Two one-tap choices, the current one pressed. Both are 44px targets. */
function ScoringChoice({
  label,
  paper,
  phone,
  usualWay,
  busy,
  onChoose,
}: {
  label: string;
  /** Whether the paper / phone choice is the current state; neither while that is unknown. */
  paper: boolean;
  phone: boolean;
  /** Which choice is only the show's usual way, not the class's own: it says so. */
  usualWay?: 'paper' | 'phone' | null;
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
        className={SCORING_BUTTON_CLASS}
        onClick={() => onChoose(true)}
      >
        {SCORING_COPY.paper}
        {paper && usualWay === 'paper' && ` ${SCORING_COPY.usualWay}`}
      </Button>
      <Button
        type="button"
        variant={phone ? 'default' : 'outline'}
        aria-pressed={phone}
        disabled={busy}
        className={SCORING_BUTTON_CLASS}
        onClick={() => onChoose(false)}
      >
        {SCORING_COPY.phone}
        {phone && usualWay === 'phone' && ` ${SCORING_COPY.usualWay}`}
      </Button>
    </div>
  );
}

/**
 * The Show Desk class panel's scoring switch (MYK9-1971): one tap, no confirmation, writes the
 * class's own `scores_on_paper` through the replicated classes table. The class's claim state
 * follows on this device at once and on others after sync. While the show's switch is unknown
 * and the class has no choice of its own, neither button is pressed; both still write.
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
      paper={onPaper === true}
      phone={onPaper === false}
      usualWay={scoresOnPaper == null ? showUsualWay(showUsesDeviceScoring) : null}
      busy={busy}
      onChoose={next => void choose(next)}
    />
  );
}

/**
 * Where the secretary assigns a judge (the class panel's Judge field), one choice for every class
 * that judge has in the show, on every day (MYK9-1971). It writes each class's `scores_on_paper`;
 * nothing is stored on the judge, so a class assigned later is scored the show's usual way, and
 * the hint says so.
 */
export function JudgeScoringChoice({
  judgeName,
  model,
  showUsesDeviceScoring,
}: {
  judgeName: string;
  model: JudgeScoringModel;
  showUsesDeviceScoring: boolean | null | undefined;
}) {
  const [busy, setBusy] = useState(false);
  const { state, targets, skipped, paperCount, phoneCount } = model;
  const choose = async (onPaper: boolean) => {
    if (state === (onPaper ? 'paper' : 'phone')) return;
    setBusy(true);
    try {
      await setClassesScoreOnPaper(
        targets.map(cls => cls.id),
        onPaper
      );
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
        {SCORING_COPY.judgeReach(targets.length, judgeName)}
        {state === 'mixed' && ` ${SCORING_COPY.judgeMixed(paperCount, phoneCount)}`}
        {skipped > 0 && ` ${SCORING_COPY.judgeSkipped(skipped)}`}
        {` ${SCORING_COPY.judgeLater(showUsualWay(showUsesDeviceScoring))}`}
      </p>
    </div>
  );
}
