import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import type { AutoArmbandDialogState } from '@/types/entry-management-types';

interface AutoArmbandDialogProps {
  dialogState: AutoArmbandDialogState;
  setDialogState: React.Dispatch<React.SetStateAction<AutoArmbandDialogState>>;
  onAutoAssign: () => Promise<void>;
  isProcessing: boolean;
}

/**
 * Dialog for auto-assigning armband numbers
 * Extracted from EntryManagementPage.tsx as part of DEBT-002 refactoring
 */
export const AutoArmbandDialog: React.FC<AutoArmbandDialogProps> = ({
  dialogState,
  setDialogState,
  onAutoAssign,
  isProcessing,
}) => {
  return (
    <Dialog
      open={dialogState.open}
      onOpenChange={(open) => !open && setDialogState({ open: false, startNumber: '1' })}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Auto-Assign Armbands</DialogTitle>
          <DialogDescription>
            Automatically assign sequential armband numbers to all accepted entries without armbands.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="start-number">Starting Number</Label>
            <Input
              id="start-number"
              type="number"
              min="1"
              value={dialogState.startNumber}
              onChange={(e) =>
                setDialogState((prev) => ({ ...prev, startNumber: e.target.value }))
              }
              placeholder="1"
            />
            <p className="text-xs text-muted-foreground">
              Armbands will be assigned starting from this number, skipping any already assigned.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setDialogState({ open: false, startNumber: '1' })}
          >
            Cancel
          </Button>
          <Button onClick={onAutoAssign} disabled={isProcessing}>
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Assigning...
              </>
            ) : (
              'Auto-Assign'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AutoArmbandDialog;
