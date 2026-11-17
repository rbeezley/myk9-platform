import React from 'react';
import { Link } from 'react-router-dom';
import { Label } from '@/components/ui/label';
import { formatShowDatesText } from './formatShowDatesText';
import { EditPanelContext } from './useEditPanel';

const LINK_CLASS =
  'inline-flex min-h-11 items-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors';

interface ShowEditTrialDatesProps {
  startDate: string;
  endDate: string;
  showId: string | undefined;
  /** Called when the link is followed, so the panel can close over the page it opens. */
  onNavigate?: (() => void) | undefined;
}

/**
 * The show's dates as text, with a link to where they change (MYK9-2131). A show's dates
 * are its trials' dates, so Show Edit no longer offers a picker that would move nothing:
 * the trial's day is changed on the trial, in Setup, Trials, Edit.
 */
export const ShowEditTrialDates: React.FC<ShowEditTrialDatesProps> = ({
  startDate,
  endDate,
  showId,
  onNavigate,
}) => {
  // Read the context directly (not useEditPanel) so the tab still renders outside a wrapper.
  // Leaving with unsaved edits would skip the wrapper's discard prompt, so the link waits.
  const hasChanges = React.useContext(EditPanelContext)?.hasChanges ?? false;
  return (
    <>
      <Label>Show Dates</Label>
      <p className="text-sm font-medium" data-testid="show-dates-text">
        {formatShowDatesText(startDate, endDate)}
      </p>
      <p className="text-sm text-muted-foreground">
        A show runs on the days of its trials. To move the show, change a trial&apos;s day.
      </p>
      {showId &&
        (hasChanges ? (
          <>
            <span
              role="link"
              aria-disabled="true"
              aria-describedby="trial-day-link-hint"
              className={`${LINK_CLASS} cursor-not-allowed opacity-50`}
            >
              Change a trial&apos;s day
            </span>
            <p id="trial-day-link-hint" className="text-sm text-muted-foreground">
              Save or cancel your changes first, then change a trial&apos;s day.
            </p>
          </>
        ) : (
          <Link
            to={`/shows/${showId}`}
            onClick={onNavigate}
            className={`${LINK_CLASS} hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`}
          >
            Change a trial&apos;s day
          </Link>
        ))}
    </>
  );
};
