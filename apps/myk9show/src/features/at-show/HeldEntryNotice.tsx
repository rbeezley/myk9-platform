import { useState, type ReactNode } from 'react';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import type { ScoreData } from '@myk9/scoring-ui';
import { Button } from '@/components/ui/button';
import { ScoreSubmitErrorBanner } from './ScoreSubmitErrorBanner';
import type { EntryHoldState } from './useEntryHeld';

/**
 * What the live scoresheet submits for its Absent chip: a zero time and the
 * "Absent" reason, nothing timed. The server's held-entry guard allows exactly
 * this write and refuses any timed or other result.
 */
const ABSENT_SCORE: ScoreData = {
  resultText: 'ABS',
  searchTime: '0.00',
  nonQualifyingReason: 'Absent',
  areas: {},
  areaTimes: [],
  correctCount: 0,
  incorrectCount: 0,
  faultCount: 0,
  finishCallErrors: 0,
  points: 0,
};

interface HeldEntryNoticeProps {
  onBack: () => void;
  submit: (scoreData: ScoreData) => Promise<void>;
  /** The submit hook's "score not saved" message, shown on this surface. */
  submitError: string | null;
  onDismissError: () => void;
}

/**
 * MYK9-1162: shown in place of the live scoresheet for an entry awaiting a
 * registration number. The dog keeps its run-order place; timing and scoring
 * are locked until the secretary adds the number. Recording the dog absent is
 * the one result that does not need it, so it stays available here.
 */
export function HeldEntryNotice({
  onBack,
  submit,
  submitError,
  onDismissError,
}: HeldEntryNoticeProps) {
  // A rejected submit would otherwise vanish: this surface returns before the
  // scoresheet's own banner, so show the same banner for it here.
  const [rejection, setRejection] = useState<string | null>(null);
  const message = submitError ?? rejection;
  const markAbsent = () => {
    setRejection(null);
    submit(ABSENT_SCORE).catch((error: unknown) => {
      setRejection(error instanceof Error ? error.message : 'The score could not be saved.');
    });
  };
  const dismiss = () => {
    setRejection(null);
    onDismissError();
  };
  return (
    <div className="ringside-root container max-w-2xl mx-auto px-4 py-6">
      {message && <ScoreSubmitErrorBanner message={message} onDismiss={dismiss} />}
      <div role="alert" className="rounded-xl border bg-card p-6 text-center">
        <ShieldAlert className="h-12 w-12 text-warning mx-auto mb-4" aria-hidden />
        <p className="text-lg font-medium">Registration number needed</p>
        <p className="text-muted-foreground">See the secretary</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button variant="outline" className="min-h-11" onClick={markAbsent}>
            Mark absent
          </Button>
          <Button variant="outline" className="min-h-11" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Entry List
          </Button>
        </div>
      </div>
    </div>
  );
}

/** The refusal a held sheet gives a score it is not offering (the server's own copy). */
export const HELD_SCORE_REFUSAL = 'Registration number needed. See the secretary.';

interface HeldEntryGateProps extends HeldEntryNoticeProps {
  /** Live from `useEntryHeld`. */
  hold: EntryHoldState;
  children: ReactNode;
}

/**
 * MYK9-1162: the one gate every scoresheet sits behind.
 *
 * Held when the sheet opened (`locked`): the notice shows, with Mark absent, and
 * the sheet below is inert, so no run can start. Held only after it opened: the
 * sheet keeps working, so a judge mid run can stop the clock, and a banner says
 * the score cannot be saved yet; the submit itself is refused by
 * `submitUnlessHeld`. The sheet stays MOUNTED throughout, so nothing on it is lost
 * when a hold arrives or clears.
 */
export function HeldEntryGate({ hold, children, ...notice }: HeldEntryGateProps) {
  const { held, locked } = hold;
  return (
    <>
      {locked && <HeldEntryNotice {...notice} />}
      {held && !locked && (
        <div
          role="alert"
          className="ringside-root mx-auto max-w-2xl px-4 pt-4"
          data-testid="held-mid-sheet-banner"
        >
          <div className="flex items-start gap-3 rounded-xl border border-warning bg-warning/10 p-4">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
            <div>
              <p className="font-medium">Registration number needed</p>
              <p className="text-sm text-muted-foreground">
                Finish this run. The score can be saved once the secretary adds the number.
              </p>
            </div>
          </div>
        </div>
      )}
      <div
        inert={locked}
        aria-hidden={locked || undefined}
        data-held={locked || undefined}
        className={locked ? 'pointer-events-none opacity-40' : undefined}
      >
        {children}
      </div>
    </>
  );
}

/** A sheet's submit that refuses while held, for anything that reaches it past `inert`. */
export function submitUnlessHeld(
  held: boolean,
  submit: (scoreData: ScoreData) => Promise<void>
): (scoreData: ScoreData) => Promise<void> {
  return scoreData => (held ? Promise.reject(new Error(HELD_SCORE_REFUSAL)) : submit(scoreData));
}
