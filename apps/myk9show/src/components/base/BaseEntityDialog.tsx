import React, { ReactNode } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import DialogFooterButtons from '@/components/common/DialogFooterButtons';

export interface BaseEntityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  titleIcon?: React.ReactNode;
  description?: string;
  children: ReactNode;
  onSubmit?: () => void;
  onCancel?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  isSubmitting?: boolean;
  submitDisabled?: boolean;
  maxWidth?: string;
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
              showIcons={submitLabel !== 'Delete' && !submitLabel?.toString().toLowerCase().includes('delete')}
            />
          </div>
        )}
      </div>
    </StandardDialog>
  );
}