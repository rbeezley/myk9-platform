import { FinancialSummary } from '@/components/secretary/FinancialSummary';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatTrialLabel } from '@myk9/core';

interface TrialFinancialsCardProps {
  /** The Reports page's trial pick; `'all'` means no trial is picked. */
  trialId: string;
  trials: ReadonlyArray<{ id: string; name: string; trial_number: string; date: string }>;
  onPickTrial: (trialId: string) => void;
}

function trialLabel(trial: { name: string; trial_number: string }): string {
  return formatTrialLabel({ name: trial.name, trialNumber: trial.trial_number });
}

/**
 * MYK9-1320: one trial's money, in the After phase beside the Financial Report. This is the view
 * the trial page's Financials tab was, the same FinancialSummary on the same trial id, so the
 * figures cannot drift. With no trial picked it asks for one rather than repeating the show-wide
 * Financial Report.
 */
export function TrialFinancialsCard({ trialId, trials, onPickTrial }: TrialFinancialsCardProps) {
  const picked = trialId !== 'all' ? trials.find(t => t.id === trialId) : undefined;

  return (
    <Card className="mb-6" data-testid="trial-financials-card">
      <CardHeader>
        <CardTitle className="text-base">
          {picked ? `Trial financials: ${trialLabel(picked)}` : 'Trial financials'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {picked || trialId !== 'all' ? (
          <FinancialSummary trialId={trialId} />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Pick a trial to see its entries, fees and payments. For the whole show, use the
              Financial Report.
            </p>
            <div className="flex flex-wrap gap-2">
              {trials.map(trial => (
                <Button
                  key={trial.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => onPickTrial(trial.id)}
                >
                  {trialLabel(trial)}
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
