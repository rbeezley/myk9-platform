import React from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import type { CheckInValidationResult } from '@/types/offline-checkin-types';

interface ValidationResultsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  validationResults: CheckInValidationResult[];
}

export const ValidationResultsDialog: React.FC<ValidationResultsDialogProps> = ({
  open,
  onOpenChange,
  validationResults,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Validation Results</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {validationResults.map((result, index) => (
            <Alert
              key={index}
              variant={result.status === 'error' ? 'destructive' : 'default'}
              className={result.status === 'warning' ? 'border-orange-200 bg-orange-50' : ''}
            >
              <AlertDescription>
                <strong>{result.check}:</strong> {result.message}
              </AlertDescription>
            </Alert>
          ))}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
