import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import type { BulkActionDialogState } from '@/types/entry-management-types';

interface BulkCheckInDialogProps {
  dialogState: BulkActionDialogState;
  setDialogState: React.Dispatch<React.SetStateAction<BulkActionDialogState>>;
  selectedCount: number;
  onBulkCheckIn: () => Promise<void>;
  isProcessing: boolean;
}

/**
 * Dialog for bulk check-in of entries
 * Extracted from EntryManagementPage.tsx as part of DEBT-002 refactoring
 */
export const BulkCheckInDialog: React.FC<BulkCheckInDialogProps> = ({
  dialogState,
  setDialogState,
  selectedCount,
  onBulkCheckIn,
  isProcessing,
}) => {
  return (
    <Dialog
      open={dialogState.open && dialogState.action === 'check_in'}
      onOpenChange={(open) => !open && setDialogState({ open: false, action: null })}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bulk Check-In</DialogTitle>
          <DialogDescription>
            Check in all classes for {selectedCount} selected entries?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setDialogState({ open: false, action: null })}
          >
            Cancel
          </Button>
          <Button onClick={onBulkCheckIn} disabled={isProcessing}>
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Checking In...
              </>
            ) : (
              'Check In All'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BulkCheckInDialog;
