import React from 'react';
import { SlideOverPanel } from '@/components/panels/SlideOverPanel';
import { Registration } from '@/types/dog-types';
import { RegistrationFormBody, RegistrationFormFooter } from './RegistrationFormBody';
import { useRegistrationEditor } from './useRegistrationEditor';

interface AddEditRegistrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Return false when an async save failed and the form should remain open. */
  onSave: (registration: Registration) => void | boolean | Promise<void | boolean>;
  initialData?: Registration | undefined; // For editing existing registration
}

/**
 * The registration form in its own slide-out, for a page that opens it
 * directly. Inside a panel that is already a slide-out, render the form inline
 * instead of stacking this on it (MYK9-1081, Add Dog's registration sub-mode).
 */
export const AddEditRegistrationDialog: React.FC<AddEditRegistrationDialogProps> = ({
  open,
  onOpenChange,
  onSave,
  initialData,
}) => {
  const editor = useRegistrationEditor({
    open,
    onSave,
    initialData,
    onSaved: () => onOpenChange(false),
  });

  return (
    <SlideOverPanel
      open={open}
      onClose={() => onOpenChange(false)}
      title={initialData ? 'Edit Registration' : 'Add New Registration'}
      // User testing: the two-column breed/variety and number/status rows were
      // too cramped to read, forcing a scroll through what is only six fields.
      // The shared `lg` size now holds at every desktop breakpoint. This
      // dialog intentionally grows one step wider at `lg` because that width
      // was verified in user testing; `className` remains the supported
      // per-caller override.
      size="lg"
      className="md:max-w-2xl lg:max-w-3xl"
      preventClose={editor.isSaving}
      footer={<RegistrationFormFooter editor={editor} onCancel={() => onOpenChange(false)} />}
    >
      <RegistrationFormBody editor={editor} />
    </SlideOverPanel>
  );
};
