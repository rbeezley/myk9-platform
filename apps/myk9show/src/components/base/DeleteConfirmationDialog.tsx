import React from 'react';
import { BaseEntityDialog } from './BaseEntityDialog';
import { AlertTriangle, Trash2 } from 'lucide-react';

export interface DeleteConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title?: string | undefined;
  titleIcon?: React.ReactNode | undefined;
  description?: string | undefined;
  entityName: string;
  entityType: string;
  isDeleting?: boolean | undefined;
  confirmLabel?: string | undefined;
  cancelLabel?: string | undefined;
}

export function DeleteConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  titleIcon,
  description,
  entityName,
  entityType,
  isDeleting = false,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
}: DeleteConfirmationDialogProps) {
  const defaultTitle = title || `Delete ${entityType}`;
  const defaultTitleIcon = titleIcon || <Trash2 className="w-5 h-5" />;
  const defaultDescription = description || `Are you sure you want to delete this ${entityType.toLowerCase()}?`;

  return (
    <BaseEntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title={defaultTitle}
      titleIcon={defaultTitleIcon}
      description={defaultDescription}
      onSubmit={onConfirm}
      submitLabel={confirmLabel}
      cancelLabel={cancelLabel}
      isSubmitting={isDeleting}
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">
              You are about to delete <strong className="text-foreground">{entityName}</strong>.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              This action cannot be undone.
            </p>
          </div>
        </div>
      </div>
    </BaseEntityDialog>
  );
}