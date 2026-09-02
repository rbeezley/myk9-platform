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
  onSubmit?: () => void | Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  isSubmitting?: boolean;
  maxWidth?: string;
  /** Render the submit action as destructive (see DialogFooterButtons). */
  destructive?: boolean;
  showFooter?: boolean;
  /**
   * Disables the submit action while leaving the dialog open and readable. For a
   * refusal the user can act on elsewhere — the dialog still has to explain it,
   * so closing the dialog or hiding the button would take the explanation with
   * it.
   */
  submitDisabled?: boolean;
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
  submitDisabled = false,
}: BaseEntityDialogProps) {
  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const handleSubmit = () => {
    // Callers report their own failures; consume rejected async handlers so a
    // handled refusal does not become an unhandledrejection.
    void Promise.resolve(onSubmit?.()).catch(() => {});
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
              {...(submitDisabled && { saveButtonProps: { disabled: true } })}
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
