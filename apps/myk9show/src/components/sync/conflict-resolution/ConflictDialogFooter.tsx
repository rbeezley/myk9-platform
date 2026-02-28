import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';

interface ConflictDialogFooterProps {
  isEnhancedMode: boolean;
  onDismiss: () => void;
  onResolveLocal: () => void;
  onResolveRemote: () => void;
  onMergeResolve: () => void;
}

export function ConflictDialogFooter({
  isEnhancedMode,
  onDismiss,
  onResolveLocal,
  onResolveRemote,
  onMergeResolve,
}: ConflictDialogFooterProps) {
  return (
    <DialogFooter className="gap-3">
      <Button variant="outline" onClick={onDismiss} className="border-border/50">
        Cancel
      </Button>

      {!isEnhancedMode && (
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={onResolveLocal}
            className="border-primary/20 text-primary hover:bg-primary/5"
          >
            Keep All Local
          </Button>

          <Button
            variant="outline"
            onClick={onResolveRemote}
            className="border-secondary-purple/20 text-secondary-purple hover:bg-secondary-purple/5"
          >
            Keep All Server
          </Button>

          <Button onClick={onMergeResolve}>Apply Selected Changes</Button>
        </div>
      )}
    </DialogFooter>
  );
}
