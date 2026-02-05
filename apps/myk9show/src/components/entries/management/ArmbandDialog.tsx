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
import type { ArmbandDialogState } from '@/types/entry-management-types';

interface ArmbandDialogProps {
  dialogState: ArmbandDialogState;
  setDialogState: React.Dispatch<React.SetStateAction<ArmbandDialogState>>;
  onAssign: () => Promise<void>;
  isProcessing: boolean;
}

/**
 * Dialog for assigning armband numbers to entries
 * Extracted from EntryManagementPage.tsx as part of DEBT-002 refactoring
 */
export const ArmbandDialog: React.FC<ArmbandDialogProps> = ({
  dialogState,
  setDialogState,
  onAssign,
  isProcessing,
}) => {
  return (
    <Dialog
      open={dialogState.open}
      onOpenChange={(open) => !open && setDialogState({ open: false, entry: null, value: '' })}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Armband</DialogTitle>
          <DialogDescription>
            Assign an armband number to {dialogState.entry?.dogName}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="armband-number">Armband Number</Label>
            <Input
              id="armband-number"
              value={dialogState.value}
              onChange={(e) => setDialogState((prev) => ({ ...prev, value: e.target.value }))}
              placeholder="Enter armband number"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setDialogState({ open: false, entry: null, value: '' })}
          >
            Cancel
          </Button>
          <Button onClick={onAssign} disabled={isProcessing || !dialogState.value.trim()}>
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Assigning...
              </>
            ) : (
              'Assign'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ArmbandDialog;
