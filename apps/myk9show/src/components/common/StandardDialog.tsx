import React from 'react';
import { CommonDialog } from './CommonDialog';
import DialogFooterButtons from './DialogFooterButtons';
import type { ButtonProps } from '@/components/ui/button';

interface StandardDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (e?: React.MouseEvent<HTMLButtonElement>) => void;
  title: string;
  titleIcon?: React.ReactNode | undefined;
  description?: React.ReactNode | undefined;
  children: React.ReactNode;
  saveLabel?: React.ReactNode | undefined;
  cancelLabel?: string | undefined;
  isSubmitting?: boolean | undefined;
  formId?: string | undefined;
  saveButtonProps?: ButtonProps | undefined;
  saveIcon?: React.ReactNode | undefined;
  hideSave?: boolean | undefined;
  showIcons?: boolean | undefined;
}

const StandardDialog: React.FC<StandardDialogProps> = ({
  open,
  onClose,
  onSave,
  title,
  titleIcon,
  description,
  children,
  saveLabel,
  cancelLabel = 'Cancel',
  isSubmitting = false,
  formId,
  saveButtonProps,
  saveIcon,
  hideSave,
  showIcons,
}) => (
  <CommonDialog
    open={open}
    onClose={onClose}
    title={title}
    titleIcon={titleIcon}
    description={description}
    footer={
      !hideSave ? (
        <DialogFooterButtons
          onCancel={onClose}
          onSubmit={onSave}
          saveLabel={saveLabel}
          cancelLabel={cancelLabel}
          isSubmitting={isSubmitting}
          showIcons={showIcons ?? (saveLabel !== 'Delete' && !saveLabel?.toString().toLowerCase().includes('delete'))}
          formId={formId}
          saveButtonProps={saveButtonProps}
          saveIcon={saveIcon}
        />
      ) : null
    }
  >
    {children}
  </CommonDialog>
);

export default StandardDialog;
