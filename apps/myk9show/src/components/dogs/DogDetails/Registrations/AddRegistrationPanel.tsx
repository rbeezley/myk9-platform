import { useMemo } from 'react';
import { z } from 'zod';
import { EditPanelWrapper } from '@/components/panels/edit/EditPanelWrapper';
import { useEditPanel } from '@/components/panels/edit/useEditPanel';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/common/FormField';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText } from 'lucide-react';
import { getBreedNamesForOrganization, getVarietiesForBreed } from '@/data/breedData';
import { registrationFormFields } from '@/lib/validation';
import { getOrgCode } from './registrationUtils';

const addRegistrationFormSchema = z.object(registrationFormFields);

type AddRegistrationFormData = z.infer<typeof addRegistrationFormSchema>;

interface AddRegistrationPanelProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: AddRegistrationFormData) => Promise<void>;
  dogName?: string | undefined;
}

const INITIAL_FORM_DATA: AddRegistrationFormData = {
  organization: '',
  registeredName: '',
  breed: '',
  variety: '',
  registrationNumber: '',
  status: 'Active',
  registrationDate: '',
};

// Inner component that accesses form from EditPanelWrapper context
function RegistrationFormFields() {
  const { form } = useEditPanel<AddRegistrationFormData>();

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
            <select
              id="organization"
              value={formData.organization}
              onChange={e => handleOrganizationChange(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-[var(--dialog-input-bg)] px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
              {...form.getFieldProps('organization')}
            >
              <option value="">Select organization</option>
              <option value="AKC (American Kennel Club)">AKC (American Kennel Club)</option>
              <option value="UKC (United Kennel Club)">UKC (United Kennel Club)</option>
              <option value="CKC (Canadian Kennel Club)">CKC (Canadian Kennel Club)</option>
              <option value="FCI (Fédération Cynologique Internationale)">
                FCI (Fédération Cynologique Internationale)
              </option>
              <option value="KC (The Kennel Club UK)">KC (The Kennel Club UK)</option>
              <option value="ILP (Indefinite Listing Privilege)">
                ILP (Indefinite Listing Privilege)
              </option>
              <option value="PAL (Purebred Alternative Listing)">
                PAL (Purebred Alternative Listing)
              </option>
              <option value="Mixed Breed">Mixed Breed</option>
              <option value="Other">Other</option>
            </select>
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
              <select
                id="breed"
                value={formData.breed}
                onChange={e => handleBreedChange(e.target.value)}
                disabled={!formData.organization}
                className="flex h-9 w-full rounded-md border border-input bg-[var(--dialog-input-bg)] px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                {...form.getFieldProps('breed')}
              >
                <option value="">
                  {formData.organization ? 'Select breed' : 'Select organization first'}
                </option>
                {availableBreeds.map(breed => (
                  <option key={breed} value={breed}>
                    {breed}
                  </option>
                ))}
              </select>
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

            <FormField label="Status" fieldId="status" required error={form.getError('status')}>
              <select
                id="status"
                value={formData.status}
                onChange={e => {
                  form.setValue('status', e.target.value);
                  form.touchField('status');
                }}
                className="flex h-9 w-full rounded-md border border-input bg-[var(--dialog-input-bg)] px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                {...form.getFieldProps('status')}
              >
                <option value="Active">Active</option>
                <option value="Pending">Pending</option>
                <option value="Expired">Expired</option>
                <option value="Under review">Under review</option>
              </select>
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

export function AddRegistrationPanel({
  open,
  onClose,
  onSave,
  dogName,
}: AddRegistrationPanelProps) {
  return (
    <EditPanelWrapper
      open={open}
      onClose={onClose}
      title="Add Registration"
      subtitle={dogName ? `Add a new registration for ${dogName}` : 'Add a new registration record'}
      initialData={INITIAL_FORM_DATA}
      onSave={onSave}
      schema={addRegistrationFormSchema}
      size="lg"
      saveLabel="Add Registration"
      showUnsavedWarning={true}
      forceHasChanges={true}
    >
      <RegistrationFormFields />
    </EditPanelWrapper>
  );
}

export default AddRegistrationPanel;
