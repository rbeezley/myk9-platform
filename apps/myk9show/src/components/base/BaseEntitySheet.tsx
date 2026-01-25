import React, { ReactNode } from 'react';
import StandardSheet from '@/components/common/StandardSheet';
import DialogFooterButtons from '@/components/common/DialogFooterButtons';
import type { SheetSize } from '@myk9/ui';

export interface BaseEntitySheetProps {
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
  submitDisabled?: boolean;
  size?: SheetSize;
  showFooter?: boolean;
}

export function BaseEntitySheet({
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
  size = 'md',
  showFooter = true,
}: BaseEntitySheetProps) {
  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const handleSubmit = () => {
    onSubmit?.();
  };

  return (
    <StandardSheet
      open={open}
      onClose={() => onOpenChange(false)}
      onSave={handleSubmit}
      title={title}
      titleIcon={titleIcon}
      description={description}
      size={size}
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
    </StandardSheet>
  );
}
