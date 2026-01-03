import React from 'react';
import { CommonDialog } from './CommonDialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Calendar, Trophy, Users, Trash2 } from 'lucide-react';
import { CascadingDeletePreview } from '@/utils/cascadingDelete';

interface CascadingDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: CascadingDeletePreview | null;
  onConfirm: () => void;
  entityType?: string;
  titleIcon?: React.ReactNode;
  isDeleting?: boolean;
}

export function CascadingDeleteDialog({
  open,
  onOpenChange,
  preview,
  onConfirm,
  entityType = 'show',
  titleIcon,
  isDeleting = false
}: CascadingDeleteDialogProps) {
  // Don't render anything if not open or no preview
  if (!open || !preview) {
    return null;
  }

  const hasRelatedData = preview.totalToDelete > 0;
  const defaultTitleIcon = titleIcon || <Trash2 className="w-5 h-5" />;

  return (
    <CommonDialog
      open={open}
      onClose={() => onOpenChange(false)}
      title={`Delete ${entityType}: ${preview.showName}`}
      titleIcon={defaultTitleIcon}
      maxWidth="max-w-2xl"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button 
            variant="destructive" 
            onClick={onConfirm}
            disabled={isDeleting}
            className="min-w-24"
          >
            {isDeleting ? 'Deleting...' : `Delete ${entityType.charAt(0).toUpperCase() + entityType.slice(1)}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-3 -mt-2">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <span className="font-medium text-foreground">Delete Confirmation</span>
        </div>
        {!hasRelatedData ? (
          <div className="text-sm text-muted-foreground">
            This {entityType} has no related data and can be safely deleted.
          </div>
        ) : (
            <>
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30 rounded-xl px-3 py-1">
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-medium leading-none m-0">
                  <AlertTriangle className="h-4 w-4" />
                  Warning: This will permanently delete all related data
                </div>
                <div className="text-sm text-red-700 dark:text-red-300 leading-tight m-0">
                  Deleting this {entityType} will also permanently delete {preview.totalToDelete} related records.
                  This action cannot be undone.
                </div>
              </div>

              <div className="space-y-2">
                {preview.trialsToDelete.length > 0 && (
                  <div className="bg-blue-50 dark:bg-blue-950/20 rounded-xl px-3 py-1">
                    <div className="flex items-center gap-2 font-medium text-sm text-blue-700 dark:text-blue-300 leading-none m-0">
                      <Calendar className="h-4 w-4" />
                      Trials ({preview.trialsToDelete.length})
                    </div>
                    <div className="ml-6">
                      {preview.trialsToDelete.map(trial => (
                        <div key={trial.id} className="text-xs text-blue-600 dark:text-blue-400 leading-none m-0">
                          • {trial.name} - {trial.date}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {preview.classesToDelete.length > 0 && (
                  <div className="bg-green-50 dark:bg-green-950/20 rounded-xl px-3 py-1">
                    <div className="flex items-center gap-2 font-medium text-sm text-green-700 dark:text-green-300 leading-none m-0">
                      <Trophy className="h-4 w-4" />
                      Classes ({preview.classesToDelete.length})
                    </div>
                    <div className="ml-6">
                      {preview.classesToDelete.map(cls => (
                        <div key={cls.id} className="text-xs text-green-600 dark:text-green-400 leading-none m-0">
                          • {cls.name} ({cls.trialName})
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {preview.entriesToDelete.length > 0 && (
                  <div className="bg-purple-50 dark:bg-purple-950/20 rounded-xl px-3 py-1">
                    <div className="flex items-center gap-2 font-medium text-sm text-purple-700 dark:text-purple-300 leading-none m-0">
                      <Users className="h-4 w-4" />
                      Entries ({preview.entriesToDelete.length})
                    </div>
                    <div className="ml-6">
                      {preview.entriesToDelete.map(entry => (
                        <div key={entry.id} className="text-xs text-purple-600 dark:text-purple-400 leading-none m-0">
                          • {entry.dogName} in {entry.className}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl px-3 py-1">
                <div className="text-sm font-medium text-foreground leading-none m-0">
                  Total records to be deleted: {preview.totalToDelete + 1}
                </div>
                <div className="text-xs text-muted-foreground leading-none m-0">
                  1 {entityType} + {preview.trialsToDelete.length} trials + {preview.classesToDelete.length} classes + {preview.entriesToDelete.length} entries
                </div>
              </div>
            </>
          )}
      </div>
    </CommonDialog>
  );
}