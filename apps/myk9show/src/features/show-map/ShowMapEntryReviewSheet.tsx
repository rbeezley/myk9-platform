import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { ShowMapEntryDisplay } from './showMapTypes';

interface ShowMapEntryReviewSheetProps {
  open: boolean;
  onClose: () => void;
  onApprove: () => void;
  isApproving: boolean;
  entryDisplay: ShowMapEntryDisplay | undefined;
  parentClassLabel?: string | undefined;
}

// INTENT: Phase B6+ — secretary approves a submitted entry from the Up Next
// surface without leaving the workbench. The sheet replaces the prior
// "Open → navigate to class page" path which forced the secretary to find
// the entry inside a class roster before they could act on it.
export function ShowMapEntryReviewSheet({
  open,
  onClose,
  onApprove,
  isApproving,
  entryDisplay,
  parentClassLabel,
}: ShowMapEntryReviewSheetProps) {
  return (
    <Sheet
      open={open}
      onOpenChange={next => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        aria-label="Review entry"
      >
        <SheetHeader className="border-b px-6 py-4 text-left">
          <SheetTitle>Review entry</SheetTitle>
          <SheetDescription>
            Submitted, waiting for secretary approval.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <dl
            className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm"
            data-testid="entry-review-fields"
          >
            {entryDisplay?.armband && (
              <>
                <dt className="font-medium text-muted-foreground">Armband</dt>
                <dd>
                  <Badge variant="secondary" className="font-mono">
                    #{entryDisplay.armband}
                  </Badge>
                </dd>
              </>
            )}

            <dt className="font-medium text-muted-foreground">Dog</dt>
            <dd>{entryDisplay?.dogName ?? 'Unknown'}</dd>

            {entryDisplay?.breed && (
              <>
                <dt className="font-medium text-muted-foreground">Breed</dt>
                <dd>{entryDisplay.breed}</dd>
              </>
            )}

            {entryDisplay?.handler && (
              <>
                <dt className="font-medium text-muted-foreground">Handler</dt>
                <dd>{entryDisplay.handler}</dd>
              </>
            )}

            {parentClassLabel && (
              <>
                <dt className="font-medium text-muted-foreground">Class</dt>
                <dd>{parentClassLabel}</dd>
              </>
            )}

            <dt className="font-medium text-muted-foreground">Status</dt>
            <dd>
              <Badge variant="outline">Submitted</Badge>
            </dd>
          </dl>
        </div>

        <SheetFooter className="border-t px-6 py-4 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isApproving}
            data-testid="entry-review-cancel"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onApprove}
            disabled={isApproving}
            data-testid="entry-review-approve"
          >
            {isApproving && <Loader2 className="h-4 w-4 animate-spin" />}
            Approve entry
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
