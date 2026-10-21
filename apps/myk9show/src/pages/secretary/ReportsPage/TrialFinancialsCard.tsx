import { FinancialSummary } from '@/components/secretary/FinancialSummary';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatTrialOptionLabel } from './trialOptionLabel';

interface TrialFinancialsCardProps {
  /** The Reports page's trial pick; `'all'` means no trial is picked. */
  trialId: string;
  trials: ReadonlyArray<{ id: string; name: string; trial_number: string; date: string }>;
  onPickTrial: (trialId: string) => void;
}

/**
 * MYK9-1320: one trial's money, in the After phase beside the Financial Report. This is the view
 * the trial page's Financials tab was, the same FinancialSummary on the same trial id, so the
 * figures cannot drift. With no trial picked it asks for one rather than repeating the show-wide
 * Financial Report.
 */
export function TrialFinancialsCard({ trialId, trials, onPickTrial }: TrialFinancialsCardProps) {
  // A trial id that is not in the list (still loading, or stale) counts as none picked.
  const picked = trials.find(t => t.id === trialId);

  return (
    <Card className="mb-6" data-testid="trial-financials-card">
      <CardHeader>
        <CardTitle className="text-base">
          {picked ? `Trial financials: ${formatTrialOptionLabel(picked)}` : 'Trial financials'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!picked && (
          <p className="text-sm text-muted-foreground">
            Pick a trial to see its entries, fees and payments. For the whole show, use the
            Financial Report.
          </p>
        )}
        {/* Stays after a pick: another trial is one tap away, without leaving Reports. */}
        <div className="flex flex-wrap gap-2">
          {trials.map(trial => (
            <Button
              key={trial.id}
              type="button"
              size="sm"
              variant={trial.id === picked?.id ? 'default' : 'outline'}
              aria-pressed={trial.id === picked?.id}
              className="min-h-11"
              onClick={() => onPickTrial(trial.id)}
            >
              {formatTrialOptionLabel(trial)}
            </Button>
          ))}
        </div>
        {picked && <FinancialSummary trialId={picked.id} />}
      </CardContent>
    </Card>
  );
}
