import { useMemo, type MutableRefObject } from 'react';
import { EditPanelWrapper } from '@/components/panels/edit/EditPanelWrapper';
import type { EditPanelVariant } from '@/components/panels/edit/EditPanelWrapper.types';
import { savedMessage } from '@/components/panels/edit/panelSaveErrors';
import {
  INITIAL_REGISTRATION_DATA,
  registrationFormSchema,
  registrationToFormData,
  type RegistrationFormData,
} from '@/components/dogs/registrationForm';
import { RegistrationPanelFields } from './RegistrationPanelFields';

// Registration data can come from the database (snake_case) or the UI (camelCase):
// RegistrationsSection hands the store whichever shape its row carried.
interface StoredRegistration {
  id?: string;
  organization?: string;
  registeredName?: string;
  registered_name?: string;
  breed?: string;
  variety?: string;
  registrationNumber?: string;
  registration_number?: string;
  status?: string;
  registrationDate?: string;
  registration_date?: string;
}

function toFormData(reg: StoredRegistration | null): RegistrationFormData {
  if (!reg) return INITIAL_REGISTRATION_DATA;
  return registrationToFormData({
    id: reg.id || '',
    organization: reg.organization || '',
    registeredName: reg.registeredName || reg.registered_name || '',
    breed: reg.breed || '',
    variety: reg.variety || '',
    registrationNumber: reg.registrationNumber || reg.registration_number || '',
    status: reg.status || 'Active',
    registrationDate: reg.registrationDate || reg.registration_date || '',
  });
}

interface EditRegistrationPanelProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: RegistrationFormData) => Promise<void>;
  registration: StoredRegistration | null;
  dogName?: string | undefined;
  /** `inline` renders the form inside a host panel (the Manage registrations panel). */
  variant?: EditPanelVariant;
  closeRequestRef?: MutableRefObject<(() => void) | null>;
}

export function EditRegistrationPanel({
  open,
  onClose,
  onSave,
  registration,
  dogName,
  variant,
  closeRequestRef,
}: EditRegistrationPanelProps) {
  const initialData = useMemo(() => toFormData(registration), [registration]);

  return (
    <EditPanelWrapper
      open={open}
      onClose={onClose}
      title="Edit Registration"
      subtitle={dogName ? `Update registration for ${dogName}` : 'Update registration details'}
      initialData={initialData}
      onSave={onSave}
      schema={registrationFormSchema}
      size="lg"
      {...(variant !== undefined && { variant })}
      {...(closeRequestRef !== undefined && { closeRequestRef })}
      saveLabel="Save Changes"
      successMessage={savedMessage(undefined, 'Registration')}
      showUnsavedWarning={true}
    >
      <RegistrationPanelFields />
    </EditPanelWrapper>
  );
}

export default EditRegistrationPanel;
