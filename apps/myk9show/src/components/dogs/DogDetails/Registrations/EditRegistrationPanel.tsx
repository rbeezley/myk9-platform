import { useMemo } from 'react';
import { z } from 'zod';
import { EditPanelWrapper } from '@/components/panels/edit/EditPanelWrapper';
import { useEditPanel } from '@/components/panels/edit/useEditPanel';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText } from 'lucide-react';
import { FormField } from '@/components/common/FormField';
import { getBreedNamesForOrganization, getVarietiesForBreed } from '@/data/breedData';
import { registrationFormFields } from '@/lib/validation';
import { getOrgCode } from './registrationUtils';

const editRegistrationFormSchema = z.object({
  id: z.string(),
  ...registrationFormFields,
});

type EditRegistrationFormData = z.infer<typeof editRegistrationFormSchema>;

// Registration data can come from database (snake_case) or UI (camelCase)
interface RegistrationInput {
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

interface EditRegistrationPanelProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: EditRegistrationFormData) => Promise<void>;
  registration: RegistrationInput | null;
  dogName?: string | undefined;
}

const INITIAL_FORM_DATA: EditRegistrationFormData = {
  id: '',
  organization: '',
  registeredName: '',
  breed: '',
  variety: '',
  registrationNumber: '',
  status: 'Active',
  registrationDate: '',
};

// Map database snake_case to camelCase
function mapToFormData(reg: RegistrationInput | null): EditRegistrationFormData {
  if (!reg) return INITIAL_FORM_DATA;

  return {
    id: reg.id || '',
    organization: reg.organization || '',
    registeredName: reg.registeredName || reg.registered_name || '',
    breed: reg.breed || '',
    variety: reg.variety || '',
    registrationNumber: reg.registrationNumber || reg.registration_number || '',
    status: reg.status || 'Active',
    registrationDate: reg.registrationDate || reg.registration_date || '',
  };
}

// Inner component that accesses form from EditPanelWrapper context
function RegistrationFormFields() {
  const { form } = useEditPanel<EditRegistrationFormData>();

  const organization = form?.data.organization ?? '';
  const breed = form?.data.breed ?? '';

  // Get breeds for the selected organization (using org code for lookup)
  const availableBreeds = useMemo(() => {
    if (!organization) return [];
    const orgCode = getOrgCode(organization);
    return getBreedNamesForOrganization(orgCode);
  }, [organization]);

  // Get varieties for the selected breed
  const availableVarieties = useMemo(() => {
    if (!organization || !breed) return [];
    const orgCode = getOrgCode(organization);
    return getVarietiesForBreed(orgCode, breed);
  }, [organization, breed]);

  if (!form) return null;

  const formData = form.data;

  // Handle organization change - clear breed and variety
  const handleOrganizationChange = (value: string) => {
    form.setValues({ organization: value, breed: '', variety: '' });
    form.touchField('organization');
  };

  // Handle breed change - clear variety
  const handleBreedChange = (value: string) => {
    form.setValues({ breed: value, variety: '' });
    form.touchField('breed');
  };

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5 text-primary" />
            Registration Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Organization */}
          <FormField
            label="Organization"
            fieldId="organization"
            required
            error={form.getError('organization')}
          >
            <Select value={formData.organization} onValueChange={handleOrganizationChange}>
              <SelectTrigger id="organization" {...form.getFieldProps('organization')}>
                <SelectValue placeholder="Select organization" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AKC (American Kennel Club)">
                  AKC (American Kennel Club)
                </SelectItem>
                <SelectItem value="UKC (United Kennel Club)">UKC (United Kennel Club)</SelectItem>
                <SelectItem value="CKC (Canadian Kennel Club)">
                  CKC (Canadian Kennel Club)
                </SelectItem>
                <SelectItem value="FCI (Fédération Cynologique Internationale)">
                  FCI (Fédération Cynologique Internationale)
                </SelectItem>
                <SelectItem value="KC (The Kennel Club UK)">KC (The Kennel Club UK)</SelectItem>
                <SelectItem value="ILP (Indefinite Listing Privilege)">
                  ILP (Indefinite Listing Privilege)
                </SelectItem>
                <SelectItem value="PAL (Purebred Alternative Listing)">
                  PAL (Purebred Alternative Listing)
                </SelectItem>
                <SelectItem value="Mixed Breed">Mixed Breed</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          {/* Registered Name */}
          <FormField
            label="Registered Name"
            fieldId="registeredName"
            required
            error={form.getError('registeredName')}
          >
            <Input
              id="registeredName"
              value={formData.registeredName}
              onChange={e => form.setValue('registeredName', e.target.value)}
              onBlur={() => form.touchField('registeredName')}
              placeholder="Full registered name"
              {...form.getFieldProps('registeredName')}
            />
          </FormField>

          {/* Breed and Variety */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Breed" fieldId="breed" required error={form.getError('breed')}>
              <Select
                value={formData.breed}
                onValueChange={handleBreedChange}
                disabled={!formData.organization}
              >
                <SelectTrigger id="breed" {...form.getFieldProps('breed')}>
                  <SelectValue
                    placeholder={
                      formData.organization ? 'Select breed' : 'Select organization first'
                    }
                  />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {availableBreeds.map(breed => (
                    <SelectItem key={breed} value={breed}>
                      {breed}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="Variety" fieldId="variety">
              {availableVarieties.length > 0 ? (
                <Select
                  value={formData.variety}
                  onValueChange={value => form.setValue('variety', value)}
                >
                  <SelectTrigger id="variety">
                    <SelectValue placeholder="Select variety" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableVarieties.map(variety => (
                      <SelectItem key={variety} value={variety}>
                        {variety}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="variety"
                  value={formData.variety}
                  onChange={e => form.setValue('variety', e.target.value)}
                  placeholder={
                    formData.breed ? 'No varieties for this breed' : 'Select breed first'
                  }
                  disabled={!formData.breed}
                />
              )}
            </FormField>
          </div>

          {/* Registration Number and Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              label="Registration Number"
              fieldId="registrationNumber"
              required
              error={form.getError('registrationNumber')}
            >
              <Input
                id="registrationNumber"
                value={formData.registrationNumber}
                onChange={e => form.setValue('registrationNumber', e.target.value)}
                onBlur={() => form.touchField('registrationNumber')}
                placeholder="Enter registration number"
                {...form.getFieldProps('registrationNumber')}
              />
            </FormField>

            <FormField label="Status" fieldId="regStatus" required error={form.getError('status')}>
              <Select
                value={formData.status}
                onValueChange={value => {
                  form.setValue('status', value);
                  form.touchField('status');
                }}
              >
                <SelectTrigger id="regStatus" {...form.getFieldProps('status')}>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Expired">Expired</SelectItem>
                  <SelectItem value="Under review">Under review</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </div>

          {/* Registration Date */}
          <FormField label="Registration Date" fieldId="registrationDate">
            <Input
              id="registrationDate"
              type="date"
              value={formData.registrationDate}
              onChange={e => form.setValue('registrationDate', e.target.value)}
            />
          </FormField>
        </CardContent>
      </Card>
    </div>
  );
}

export function EditRegistrationPanel({
  open,
  onClose,
  onSave,
  registration,
  dogName,
}: EditRegistrationPanelProps) {
  const initialData = useMemo(() => mapToFormData(registration), [registration]);

  return (
    <EditPanelWrapper
      open={open}
      onClose={onClose}
      title="Edit Registration"
      subtitle={dogName ? `Update registration for ${dogName}` : 'Update registration details'}
      initialData={initialData}
      onSave={onSave}
      schema={editRegistrationFormSchema}
      size="lg"
      saveLabel="Save Changes"
      showUnsavedWarning={true}
    >
      <RegistrationFormFields />
    </EditPanelWrapper>
  );
}

export default EditRegistrationPanel;
