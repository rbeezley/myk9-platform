import { useEditPanel } from '@/components/panels/edit/useEditPanel';
import type { FormValidation } from '@/hooks/useFormValidation';
import { RegistrationFormBody } from '@/components/dogs/RegistrationFormBody';
import type { RegistrationFormData } from '@/components/dogs/registrationForm';
import { useRegistrationFormFields } from '@/components/dogs/useRegistrationFormFields';

function FieldsOverForm({ form }: { form: FormValidation<RegistrationFormData> }) {
  const editor = useRegistrationFormFields(form);
  return <RegistrationFormBody editor={editor} />;
}

/**
 * The one registration form (RegistrationFormBody) over the form EditPanelWrapper
 * owns, so Dog Details' Add and Edit panels are thin hosts that save to the
 * database (MYK9-1117).
 */
export function RegistrationPanelFields() {
  const { form } = useEditPanel<RegistrationFormData>();
  return form ? <FieldsOverForm form={form} /> : null;
}
