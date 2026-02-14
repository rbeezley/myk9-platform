import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SubmitActionsProps {
  canSubmit: boolean;
  isSubmitting: boolean;
  entriesWithData: number;
  onSubmit: () => void;
}

export function SubmitActions({
  canSubmit,
  isSubmitting,
  entriesWithData,
  onSubmit
}: SubmitActionsProps) {
  return (
    <div className="apple-show-info-card">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Press Enter or Tab to move between fields quickly
        </div>

        <Button
          onClick={onSubmit}
          disabled={!canSubmit || isSubmitting}
          className="apple-action-button apple-action-button-primary"
        >
          <Save className="h-4 w-4" />
          <span>{isSubmitting ? 'Submitting...' : `Submit ${entriesWithData} Results`}</span>
        </Button>
      </div>
    </div>
  );
}
