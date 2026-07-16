import React, { ReactNode } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import DialogFooterButtons from '@/components/common/DialogFooterButtons';

export interface BaseEntityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  titleIcon?: React.ReactNode;
  description?: string | undefined;
  children: ReactNode;
  onSubmit?: () => void;
  onCancel?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  isSubmitting?: boolean;
  /**
   * @deprecated Declared but not wired — its only caller is the dead FormDialog.
   * Removed together with FormDialog when the shadow token layer is deleted.
   */
  submitDisabled?: boolean;
  maxWidth?: string;
  /** Render the submit action as destructive (see DialogFooterButtons). */
  destructive?: boolean;
  showFooter?: boolean;
}

export function BaseEntityDialog({
  open,
  onOpenChange,
  title,
  titleIcon,
  description,
  children,
  onSubmit,
  onCancel,
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  isSubmitting = false,
  maxWidth,
  destructive,
  showFooter = true,
}: BaseEntityDialogProps) {
  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const handleSubmit = () => {
    onSubmit?.();
  };

  return (
    <StandardDialog
      open={open}
      onClose={() => onOpenChange(false)}
      onSave={handleSubmit}
      title={title}
      titleIcon={titleIcon}
      description={description}
      {...(maxWidth !== undefined && { maxWidth })}
      hideSave={true}
    >
      <div className="space-y-4">
        {children}
        {showFooter && (
          <div className="mt-6">
            <DialogFooterButtons
              onCancel={handleCancel}
              onSubmit={handleSubmit}
              cancelLabel={cancelLabel}
              saveLabel={submitLabel}
              isSubmitting={isSubmitting}
              showIcons={
                submitLabel !== 'Delete' &&
                !submitLabel?.toString().toLowerCase().includes('delete')
              }
              {...(destructive !== undefined && { destructive })}
            />
          </div>
        )}
      </div>
    </StandardDialog>
  );
}
