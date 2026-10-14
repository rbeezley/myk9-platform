/**
 * State and submit for the registration form an unsaved dog's registrations are
 * edited with (MYK9-1081). Rendered by `RegistrationFormBody`. It writes an
 * in-memory `Registration` through `onSave`; the Dog Details panels run the same
 * fields over EditPanelWrapper's form instead (MYK9-1117).
 */
import React, { useState } from 'react';
import { Registration } from '@/types/dog-types';
import { useFormValidation } from '@/hooks/useFormValidation';
import { toast } from 'sonner';
import {
  INITIAL_REGISTRATION_DATA,
  formDataToRegistration,
  registrationFormSchema,
  registrationToFormData,
  type RegistrationFormData,
} from './registrationForm';
import { useRegistrationFormFields } from './useRegistrationFormFields';

export {
  INITIAL_REGISTRATION_DATA,
  REGISTRATION_NUMBER_PATTERN,
  REGISTRATION_ORGS,
} from './registrationForm';

interface UseRegistrationEditorOptions {
  /** The container's open state; the form re-seeds each time it opens. */
  open: boolean;
  /** Return false when an async save failed and the form should remain open. */
  onSave: (registration: Registration) => void | boolean | Promise<void | boolean>;
  initialData?: Registration | undefined;
  /** Called after a save the caller did not refuse: the container closes. */
  onSaved: () => void;
}

/** The registration form's state and submit for the in-memory hosts. */
export function useRegistrationEditor({
  open,
  onSave,
  initialData,
  onSaved,
}: UseRegistrationEditorOptions) {
  const formInitial = initialData ? registrationToFormData(initialData) : INITIAL_REGISTRATION_DATA;
  const form = useFormValidation(registrationFormSchema, formInitial);

  // Reset state when dialog opens or initialData changes
  const [wasOpen, setWasOpen] = React.useState(open);
  const [lastInitialData, setLastInitialData] = React.useState(initialData);

  if (open && (!wasOpen || initialData !== lastInitialData)) {
    setWasOpen(open);
    setLastInitialData(initialData);
    form.reset(formInitial);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  const fields = useRegistrationFormFields(form);

  const [isSaving, setIsSaving] = useState(false);

  const onSubmitValid = async (validatedData: RegistrationFormData) => {
    if (isSaving) return;

    const registration = formDataToRegistration(validatedData);
    setIsSaving(true);
    try {
      const saveResult = await onSave(registration);
      if (saveResult !== false) onSaved();
    } catch {
      toast.error("We couldn't save that registration. You can try again.");
    } finally {
      setIsSaving(false);
    }
  };
  const handleSubmit = form.handleSubmit(onSubmitValid);

  return { ...fields, isSaving, handleSubmit };
}

export type RegistrationEditor = ReturnType<typeof useRegistrationEditor>;
