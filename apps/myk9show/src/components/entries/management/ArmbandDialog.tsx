import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/common/FormField';
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
  onNextArmband: () => Promise<void>;
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
  onNextArmband,
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
          <FormField label="Armband Number" fieldId="armband-number">
            <div className="flex gap-2">
              <Input
                id="armband-number"
                value={dialogState.value}
                onChange={(e) => setDialogState((prev) => ({ ...prev, value: e.target.value, error: null }))}
                placeholder="Enter armband number"
                className={dialogState.error ? 'border-destructive' : ''}
              />
              <Button
                type="button"
                variant="outline"
                onClick={onNextArmband}
                disabled={isProcessing}
                title="Fill with next available number"
              >
                Next
              </Button>
            </div>
          </FormField>
          {dialogState.error && (
            <p className="text-sm text-destructive">{dialogState.error}</p>
          )}
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
