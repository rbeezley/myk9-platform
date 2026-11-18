/**
 * ResultsPublicPrompt — asks an exhibitor, once, whether to show their results
 * publicly, at the moment it means something: their dog placed in a released
 * class (MYK9-1944).
 *
 * It only ever writes the account's own "Show my results publicly" choice (the
 * same setting as the Results privacy card). Visibility stays with the server:
 * a result is public only when everyone on the entry has opted in and the club
 * has not made the show private, so this component never reveals anything and
 * keeps no client-side shortcut. It is not asked for a show the club keeps
 * private, for anyone whose setting is already on, or after either answer.
 *
 * INTENT: "Keep private" and "Show publicly" are equally easy to reach and the
 * line saying what yes means (all dogs, every show) is shown BEFORE answering.
 * The default stays private; nothing changes until the exhibitor answers.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useExhibitorProfile } from '@/hooks/useExhibitorProfile';
import { useIsOnline } from '@/hooks/useNetworkStatus';
import { useShowSettings } from '@/hooks/queries/useShowSettingsDatabase';
import { formatOrdinal } from '@/features/result-card';
import { getUserFriendlyError } from '@/utils/errorMessages';

export interface ResultsPublicPromptProps {
  showId: string;
  dogName: string;
  className: string;
  /** The own result's final placement; the server withholds it until release. */
  placement: number | null | undefined;
  /** True once the class's results are released. */
  isReleased: boolean;
}

type Outcome = 'idle' | 'shown-publicly';

export function ResultsPublicPrompt({
  showId,
  dogName,
  className,
  placement,
  isReleased,
}: ResultsPublicPromptProps) {
  const { profile, profileSettled, answerResultsPublicPrompt, isAnsweringResultsPublicPrompt } =
    useExhibitorProfile();
  const { data: showSettings } = useShowSettings(showId || null);
  const isOnline = useIsOnline();
  const [outcome, setOutcome] = useState<Outcome>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  // After a yes the profile already reads as answered; this row stays so the
  // exhibitor still hears what a co-owner or handler could change.
  if (outcome === 'shown-publicly') {
    return (
      <p
        className="mt-1 text-sm text-muted-foreground"
        role="status"
        data-testid="results-public-note"
      >
        Your results are now public. A result shows publicly only when everyone on the entry (owner,
        co-owner and handler) has turned on Show my results publicly, so it stays private until they
        do.
      </p>
    );
  }

  const isPlaced = typeof placement === 'number' && placement > 0;
  // Unknown is not "ask": a profile or show setting that has not loaded, or a
  // show whose setting could not be read, never produces the question.
  const shouldAsk =
    isPlaced &&
    isReleased &&
    profileSettled &&
    profile != null &&
    !profile.results_public &&
    profile.results_public_prompt_answered_at == null &&
    showSettings != null &&
    !showSettings.resultsPrivate;
  if (!shouldAsk) return null;

  async function answer(showPublicly: boolean) {
    setSaveError(null);
    try {
      await answerResultsPublicPrompt(showPublicly);
      if (showPublicly) setOutcome('shown-publicly');
    } catch (error) {
      // Nothing was saved: the question stays and says so.
      setSaveError(
        isOnline
          ? getUserFriendlyError(error)
          : 'You are offline, so this was not saved. Answer again when you are back online.'
      );
    }
  }

  return (
    <div
      className="mt-2 w-full rounded-md border bg-muted/40 px-3 py-2 text-sm"
      role="group"
      aria-label="Show your results publicly"
      data-testid="results-public-prompt"
    >
      <p className="font-medium">
        {dogName} placed {formatOrdinal(placement as number)} in {className}. Show your results
        publicly?
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        This shows all your dogs&apos; results publicly, at every show. You can change it in your
        account.
      </p>
      {saveError && (
        <p className="mt-1 text-xs text-destructive" role="alert">
          {saveError}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="min-h-[44px]"
          disabled={isAnsweringResultsPublicPrompt}
          onClick={() => void answer(true)}
        >
          Show publicly
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-[44px]"
          disabled={isAnsweringResultsPublicPrompt}
          onClick={() => void answer(false)}
        >
          Keep private
        </Button>
      </div>
    </div>
  );
}
