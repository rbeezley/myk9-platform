import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SubmitActionsProps {
  canSubmit: boolean;
  isSubmitting: boolean;
  entriesWithData: number;
  totalEntries: number;
  onSubmit: () => void;
}

export function SubmitActions({
  canSubmit,
  isSubmitting,
  entriesWithData,
  totalEntries,
  onSubmit,
}: SubmitActionsProps) {
  const skippedCount = totalEntries - entriesWithData;
  const buttonLabel = isSubmitting
    ? 'Submitting...'
    : skippedCount > 0 && entriesWithData > 0
      ? `Submit ${entriesWithData} results (skip ${skippedCount} incomplete)`
      : `Submit ${entriesWithData} Results`;

  return (
    <div className="myk9-show-info-card">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Press Enter or Tab to move between fields quickly
        </div>

        <Button
          onClick={onSubmit}
          disabled={!canSubmit || isSubmitting}
          className="myk9-action-button myk9-action-button-primary"
        >
          <Save className="h-4 w-4" />
          <span>{buttonLabel}</span>
        </Button>
      </div>
    </div>
  );
}
