import React from 'react';
import { SlideOverPanel } from '@/components/panels/SlideOverPanel';

interface ChecklistPanelRouterProps {
  panelKey: string | null;
  trialId: string;
  showId: string;
  onClose: () => void;
}

/**
 * Routes a checklist item's navigateTo key to the correct slide-over panel content.
 * Each panel contains the editing form for that config area.
 * New panels are added here as we build out each config screen.
 */
export const ChecklistPanelRouter: React.FC<ChecklistPanelRouterProps> = ({
  panelKey,
  trialId,
  showId,
  onClose,
}) => {
  if (!panelKey) return null;

  const panelConfig: Record<string, { title: string; subtitle: string }> = {
    venue: { title: 'Venue Assignment', subtitle: 'Set the trial venue' },
    dates: { title: 'Trial Dates', subtitle: 'Confirm dates and start times' },
    judges: { title: 'Judge Assignment', subtitle: 'Assign judges to this trial' },
    fees: { title: 'Entry Fees', subtitle: 'Configure fee schedule' },
    classes: { title: 'Class Configuration', subtitle: 'Create and configure classes' },
    'entry-dates': { title: 'Entry Period', subtitle: 'Set open and close dates' },
    entries: { title: 'Entry Management', subtitle: 'View and manage entries' },
    'run-order': { title: 'Running Order', subtitle: 'Generate and review run order' },
    waitlist: { title: 'Waitlist', subtitle: 'Process waitlist entries' },
    'scoring-day': { title: 'Scoring Day', subtitle: 'Monitor scoring progress' },
    results: { title: 'Results', subtitle: 'Publish and review results' },
  };

  const config = panelConfig[panelKey];
  if (!config) return null;

  return (
    <SlideOverPanel
      open={!!panelKey}
      onClose={onClose}
      title={config.title}
      subtitle={config.subtitle ?? undefined}
      size="lg"
    >
      <div className="p-6">
        <p className="text-sm text-muted-foreground">
          Configuration panel for &ldquo;{panelKey}&rdquo; &mdash; will be wired to existing
          edit forms. Trial: {trialId}, Show: {showId}.
        </p>
      </div>
    </SlideOverPanel>
  );
};
