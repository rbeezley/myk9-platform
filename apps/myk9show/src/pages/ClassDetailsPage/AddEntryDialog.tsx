/**
 * Add Entry Dialog
 *
 * Dialog with RegistrationWorkflow for adding entries to a class
 */

import { Suspense } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RegistrationWorkflow } from '@/components/shows/RegistrationWorkflow';
import { RegistrationProvider } from '@/context/RegistrationContext';
import { logger } from '@/services/LoggingService';
import type { ClassData } from './types';

interface Show {
  id: string;
  name?: string;
}

interface AddEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentShow: Show | undefined;
  currentClass: ClassData | null;
}

export function AddEntryDialog({
  open,
  onOpenChange,
  parentShow,
  currentClass,
}: AddEntryDialogProps) {
  if (!parentShow) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-gray-100">
            Add Entry - {currentClass?.element} {currentClass?.level} {currentClass?.section}
          </DialogTitle>
        </DialogHeader>
        <RegistrationProvider>
          <Suspense
            fallback={
              <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-3 text-gray-600 dark:text-gray-400">
                  Loading registration...
                </span>
              </div>
            }
          >
            <RegistrationWorkflow
              showId={parentShow.id}
              onComplete={(data) => {
                logger.info('Registration completed', 'classes', { showId: parentShow.id, data });
                onOpenChange(false);
              }}
              onCancel={() => onOpenChange(false)}
            />
          </Suspense>
        </RegistrationProvider>
      </DialogContent>
    </Dialog>
  );
}
