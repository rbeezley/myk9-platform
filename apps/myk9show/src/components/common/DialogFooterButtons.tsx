import { Button, ButtonProps } from '@/components/ui/button';
import { Check, X } from 'lucide-react';
import React from 'react';

interface DialogFooterButtonsProps {
  onCancel: () => void;
  onSubmit: (e?: React.MouseEvent<HTMLButtonElement>) => void;
  saveLabel?: React.ReactNode;
  cancelLabel?: string;
  isSubmitting?: boolean;
  showIcons?: boolean | undefined;
  formId?: string | undefined;
  saveButtonProps?: ButtonProps | undefined;
  saveIcon?: React.ReactNode;
}

const DialogFooterButtons: React.FC<DialogFooterButtonsProps> = ({
  onCancel,
  onSubmit,
  saveLabel = 'Save',
  cancelLabel = 'Cancel',
  isSubmitting = false,
  showIcons = true,
  formId,
  saveButtonProps,
  saveIcon,
}) => (
  <div className="flex justify-end gap-3">
    {cancelLabel && typeof cancelLabel === 'string' && cancelLabel.trim() !== '' ? (
      <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
        {showIcons && <X className="w-4 h-4 mr-2" />} {cancelLabel}
      </Button>
    ) : null}
    <Button
      type="button"
      variant={saveButtonProps?.variant ?? (
        saveLabel === 'Close' ? 'outline' : 
        (saveLabel === 'Delete' || (typeof saveLabel === 'string' && saveLabel.toLowerCase().includes('delete'))) ? 'destructive' : 
        'default'
      )}
      className={saveButtonProps?.className}
      disabled={isSubmitting}
      form={formId}
      onClick={onSubmit}
      {...saveButtonProps}
    >
      {showIcons && (
        saveLabel === 'Close'
          ? <X className="w-4 h-4 mr-2" />
          : (saveIcon !== undefined
              ? saveIcon
              : (typeof saveLabel === 'string' ? <Check className="w-4 h-4 mr-2" /> : null)
            )
      )} {saveLabel}
    </Button>
  </div>
);

export default DialogFooterButtons;
