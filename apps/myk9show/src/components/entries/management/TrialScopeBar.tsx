import { Link } from 'react-router-dom';
import { ClipboardList, ListChecks, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TrialScopeBarProps {
  /** Whether the Roster view is active (vs the filtered entry List). */
  rosterView: boolean;
  onRosterViewChange: (on: boolean) => void;
  /** When a class is selected, offer an explicit deep-link to its scoresheet. */
  classId: string | null;
}

/**
 * Controls shown once a trial is selected on the Entry Management page (Phase D).
 *
 * Replaces the old silent mode-switch: selecting a trial used to morph the page
 * into a roster, and selecting a class redirected off-page into scoring. Now the
 * trial/class dropdowns are plain in-place filters, Roster is an explicit toggle,
 * and scoring is an explicit, labeled deep-link out to the dedicated scoresheet
 * (the `/scoring` surface owns it). Nothing navigates or changes shape without a
 * deliberate click.
 */
export function TrialScopeBar({ rosterView, onRosterViewChange, classId }: TrialScopeBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2" role="group" aria-label="Trial view">
        <Button
          type="button"
          size="sm"
          variant={!rosterView ? 'default' : 'outline'}
          aria-pressed={!rosterView}
          className="h-9 gap-2"
          onClick={() => onRosterViewChange(false)}
        >
          <ListChecks className="h-4 w-4" />
          List
        </Button>
        <Button
          type="button"
          size="sm"
          variant={rosterView ? 'default' : 'outline'}
          aria-pressed={rosterView}
          className="h-9 gap-2"
          onClick={() => onRosterViewChange(true)}
        >
          <ClipboardList className="h-4 w-4" />
          Roster
        </Button>
      </div>

      {classId && (
        <Button
          size="sm"
          variant="outline"
          className="h-9 gap-2"
          render={<Link to={`/scoring/classes/${classId}/entries`} />}
        >
          Score this class
          <ArrowRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export default TrialScopeBar;
