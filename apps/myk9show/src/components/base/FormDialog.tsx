import { ReactNode, FormEvent } from 'react';
import { BaseEntityDialog } from './BaseEntityDialog';
import { buildClasses } from '@/utils/designTokens';

export interface FormDialogProps<T = Record<string, unknown>> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  onSubmit: (data: T) => void | Promise<void>;
  initialData?: Partial<T>;
  children: ReactNode;
  submitLabel?: string;
  cancelLabel?: string;
  isSubmitting?: boolean;
  submitDisabled?: boolean;
  maxWidth?: string;
}

export function FormDialog<T = Record<string, unknown>>({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
  children,
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  isSubmitting = false,
  submitDisabled = false,
  maxWidth = 'max-w-md',
}: FormDialogProps<T>) {
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const data = Object.fromEntries(formData.entries()) as unknown as T;
    await onSubmit(data);
  };

  return (
    <BaseEntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      submitLabel={submitLabel}
      cancelLabel={cancelLabel}
      isSubmitting={isSubmitting}
      submitDisabled={submitDisabled}
      maxWidth={maxWidth}
      showFooter={false}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {children}
        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className={`${buildClasses.button.secondary} px-4 py-2 text-sm font-medium border rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors`}
          >
            {cancelLabel}
          </button>
          <button
            type="submit"
            disabled={isSubmitting || submitDisabled}
            className={`${buildClasses.button.primary} px-4 py-2 text-sm font-medium border-transparent rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
          >
            {isSubmitting ? 'Saving...' : submitLabel}
          </button>
        </div>
      </form>
    </BaseEntityDialog>
  );
}