import React from 'react';
import { formatTrialDate, formatTrialLabel } from '@myk9/core';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useShowTrials } from '@/hooks/queries/useShowTrials';
import { formatShowDatesText } from './formatShowDatesText';
import { EditPanelContext } from './useEditPanel';

interface ShowEditTrialDatesProps {
  startDate: string;
  endDate: string;
  showId: string | undefined;
  /**
   * Opens the chosen trial's Edit Trial panel on the show page (closing this sheet). Without it
   * (a host with no trial dialogs, such as a club's show list) the day buttons are not offered.
   */
  onEditTrial?: ((trialId: string) => void) | undefined;
}

/**
 * The show's dates as text, with one button per trial that opens that trial's Edit Trial
 * (MYK9-2375). A show's dates are its trials' dates, so Show Edit offers no picker that would
 * move nothing: the trial's day changes on the trial, in the one Edit Trial panel.
 */
export const ShowEditTrialDates: React.FC<ShowEditTrialDatesProps> = ({
  startDate,
  endDate,
  showId,
  onEditTrial,
}) => {
  // Read the context directly (not useEditPanel) so the tab still renders outside a wrapper.
  // Leaving with unsaved edits would skip the wrapper's discard prompt, so the buttons wait.
  const hasChanges = React.useContext(EditPanelContext)?.hasChanges ?? false;
  // Replica-first read (offline-safe); soft-deleted trials are already excluded.
  const { data: trials = [] } = useShowTrials(onEditTrial ? (showId ?? null) : null);
  return (
    <>
      <Label>Show Dates</Label>
      <p className="text-sm font-medium" data-testid="show-dates-text">
        {formatShowDatesText(startDate, endDate)}
      </p>
      <p className="text-sm text-muted-foreground">
        A show runs on the days of its trials. To move the show, change a trial&apos;s day.
      </p>
      {onEditTrial && trials.length > 0 && (
        <div className="flex flex-col items-start gap-2">
          {trials.map(trial => {
            const label = formatTrialLabel({ name: trial.name, trialNumber: trial.trial_number });
            const day = trial.trial_date ? formatTrialDate(trial.trial_date) : 'No date yet';
            return (
              <Button
                key={trial.id}
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={hasChanges}
                aria-describedby={hasChanges ? 'trial-day-link-hint' : undefined}
                onClick={() => onEditTrial(trial.id)}
              >
                {label} &middot; {day} &middot; Change day
              </Button>
            );
          })}
          {hasChanges && (
            <p id="trial-day-link-hint" className="text-sm text-muted-foreground">
              Save or cancel your changes first, then change a trial&apos;s day.
            </p>
          )}
        </div>
      )}
    </>
  );
};
