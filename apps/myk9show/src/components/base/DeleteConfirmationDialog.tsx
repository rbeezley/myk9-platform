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
  /**
   * Rendered inline right after the entity name in the primary sentence, e.g.
   * " and 2 entries" → "You are about to delete <b>Dog 1</b> and 2 entries.".
   * Omit for the plain "You are about to delete <b>X</b>." form.
   */
  impactSuffix?: React.ReactNode | undefined;
  /**
   * Replaces the default "This action cannot be undone." line. Use when the
   * delete is reversible (e.g. a soft-delete that an admin can restore).
   */
  warningText?: React.ReactNode | undefined;
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
  impactSuffix,
  warningText = 'This action cannot be undone.',
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
              You are about to delete <strong className="text-foreground">{entityName}</strong>
              {impactSuffix}.
            </p>
            <p className="text-sm text-muted-foreground mt-2">{warningText}</p>
          </div>
        </div>
      </div>
    </BaseEntityDialog>
  );
}