import { AlertTriangle, ArrowLeft, CheckCircle, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ReviewStepActionsProps {
  errorCount: number;
  showName: string;
  trialCount: number;
  totalClasses: number;
  totalJudges: number;
  classesWithJudges: number;
  isLoading: boolean;
  submitLabel: string;
  onBack?: (() => void) | undefined;
  onCreateShow: () => void;
}

export function ReviewStepActions({
  errorCount,
  showName,
  trialCount,
  totalClasses,
  totalJudges,
  classesWithJudges,
  isLoading,
  submitLabel,
  onBack,
  onCreateShow,
}: ReviewStepActionsProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {errorCount === 0 && (
          <div className="bg-success/10 border border-success/30 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="font-medium text-success text-sm">Show Configuration Complete</div>
                <p className="text-xs text-success mt-0.5">
                  "{showName}" ready with {trialCount} trials and {totalClasses} classes
                </p>
              </div>
            </div>
          </div>
        )}

        {totalJudges > 0 && classesWithJudges < totalClasses && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="font-medium text-warning text-sm">Incomplete Judge Assignments</div>
                <p className="text-xs text-warning mt-0.5">
                  {totalClasses - classesWithJudges} of {totalClasses} classes need judges
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex justify-start">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Classes
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={onCreateShow} disabled={isLoading} className="flex-1">
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileText className="h-4 w-4 mr-2" />
            )}
            {isLoading ? 'Saving...' : submitLabel}
          </Button>
        </div>
      </div>

      <div className="text-xs text-muted-foreground text-center">
        <p>Your show will stay private until you publish it from the show page.</p>
      </div>
    </div>
  );
}
