import { useEffect, useMemo, useState } from 'react';
import { EditPanelWrapper } from '@/components/panels/edit/EditPanelWrapper';
import { useEditPanel } from '@/components/panels/edit/useEditPanel';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/common/FormField';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText } from 'lucide-react';
import { getBreedNamesForOrganization, getVarietiesForBreed } from '@/data/breedData';

// Component to sync form data with EditPanelWrapper's internal state
function FormDataSync<T extends Record<string, unknown>>({ data }: { data: T }) {
  const { setData } = useEditPanel<T>();
  useEffect(() => {
    setData(data);
  }, [data, setData]);
  return null;
}

// Extract organization code from full string (e.g., "AKC" from "AKC (American Kennel Club)")
function getOrgCode(organization: string): string {
  if (!organization) return '';
  // Handle codes at the start like "AKC (American Kennel Club)"
  const match = organization.match(/^(\w+)\s*\(/);
  if (match) return match[1];
  // Handle special cases
  if (organization === 'Mixed Breed') return 'Other';
  if (organization === 'Other') return 'Other';
  return organization;
}

interface RegistrationFormData extends Record<string, unknown> {
  organization: string;
  registeredName: string;
  breed: string;
  variety: string;
  registrationNumber: string;
  status: string;
  registrationDate: string;
}

interface AddRegistrationPanelProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: RegistrationFormData) => Promise<void>;
  dogName?: string | undefined;
}

const INITIAL_FORM_DATA: RegistrationFormData = {
  organization: '',
  registeredName: '',
  breed: '',
  variety: '',
  registrationNumber: '',
  status: 'Active',
  registrationDate: '',
};

// Internal state combining form data with tracking for reset logic
interface PanelState {
  prevOpen: boolean;
  formData: RegistrationFormData;
}

export function AddRegistrationPanel({
  open,
  onClose,
  onSave,
  dogName,
}: AddRegistrationPanelProps) {
  const [state, setState] = useState<PanelState>({
    prevOpen: false,
    formData: INITIAL_FORM_DATA,
  });

  // Reset form when panel opens - track previous open in state (not refs)
  const needsReset = open && !state.prevOpen;
  const needsSync = state.prevOpen !== open;

  if (needsReset || needsSync) {
    setState({
      prevOpen: open,
      formData: needsReset ? INITIAL_FORM_DATA : state.formData,
    });
  }

  const formData = state.formData;
  const setFormData = (updater: RegistrationFormData | ((prev: RegistrationFormData) => RegistrationFormData)) => {
    setState(prev => ({
      ...prev,
      formData: typeof updater === 'function' ? updater(prev.formData) : updater,
    }));
  };

  // Get breeds for the selected organization (using org code for lookup)
  const availableBreeds = useMemo(() => {
    if (!formData.organization) return [];
    const orgCode = getOrgCode(formData.organization);
    return getBreedNamesForOrganization(orgCode);
  }, [formData.organization]);

  // Get varieties for the selected breed
  const availableVarieties = useMemo(() => {
    if (!formData.organization || !formData.breed) return [];
    const orgCode = getOrgCode(formData.organization);
    return getVarietiesForBreed(orgCode, formData.breed);
  }, [formData.organization, formData.breed]);

  // Handle organization change - clear breed and variety
  const handleOrganizationChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      organization: value,
      breed: '',
      variety: ''
    }));
  };

  // Handle breed change - clear variety
  const handleBreedChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      breed: value,
      variety: ''
    }));
  };

  const handleFieldChange = (field: keyof RegistrationFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const validateData = (data: RegistrationFormData): string[] | null => {
    const errors: string[] = [];
    if (!data.organization) errors.push('Please select an organization');
    if (!data.registeredName) errors.push('Please enter a registered name');
    if (!data.breed) errors.push('Please select a breed');
    if (!data.registrationNumber) errors.push('Please enter a registration number');
    if (!data.status) errors.push('Please select a status');
    return errors.length > 0 ? errors : null;
  };

  const handleSave = async () => {
    await onSave(formData);
  };

  return (
    <EditPanelWrapper
      open={open}
      onClose={onClose}
      title="Add Registration"
      subtitle={dogName ? `Add a new registration for ${dogName}` : 'Add a new registration record'}
      initialData={INITIAL_FORM_DATA}
      onSave={handleSave}
      validateData={validateData}
      size="lg"
      saveLabel="Add Registration"
      showUnsavedWarning={true}
    >
      <FormDataSync data={formData} />
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
            <FormField label="Organization" fieldId="organization" required>
              <Select
                value={formData.organization}
                onValueChange={handleOrganizationChange}
              >
                <SelectTrigger id="organization">
                  <SelectValue placeholder="Select organization" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AKC (American Kennel Club)">AKC (American Kennel Club)</SelectItem>
                  <SelectItem value="UKC (United Kennel Club)">UKC (United Kennel Club)</SelectItem>
                  <SelectItem value="CKC (Canadian Kennel Club)">CKC (Canadian Kennel Club)</SelectItem>
                  <SelectItem value="FCI (Fédération Cynologique Internationale)">FCI (Fédération Cynologique Internationale)</SelectItem>
                  <SelectItem value="KC (The Kennel Club UK)">KC (The Kennel Club UK)</SelectItem>
                  <SelectItem value="ILP (Indefinite Listing Privilege)">ILP (Indefinite Listing Privilege)</SelectItem>
                  <SelectItem value="PAL (Purebred Alternative Listing)">PAL (Purebred Alternative Listing)</SelectItem>
                  <SelectItem value="Mixed Breed">Mixed Breed</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </FormField>

            {/* Registered Name */}
            <FormField label="Registered Name" fieldId="registeredName" required>
              <Input
                id="registeredName"
                value={formData.registeredName}
                onChange={(e) => handleFieldChange('registeredName', e.target.value)}
                placeholder="Full registered name"
              />
            </FormField>

            {/* Breed and Variety */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="Breed" fieldId="breed" required>
                <Select
                  value={formData.breed}
                  onValueChange={handleBreedChange}
                  disabled={!formData.organization}
                >
                  <SelectTrigger id="breed">
                    <SelectValue placeholder={formData.organization ? "Select breed" : "Select organization first"} />
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
                    onValueChange={(value) => handleFieldChange('variety', value)}
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
                    onChange={(e) => handleFieldChange('variety', e.target.value)}
                    placeholder={formData.breed ? "No varieties for this breed" : "Select breed first"}
                    disabled={!formData.breed}
                  />
                )}
              </FormField>
            </div>

            {/* Registration Number and Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="Registration Number" fieldId="registrationNumber" required>
                <Input
                  id="registrationNumber"
                  value={formData.registrationNumber}
                  onChange={(e) => handleFieldChange('registrationNumber', e.target.value)}
                  placeholder="Enter registration number"
                />
              </FormField>

              <FormField label="Status" fieldId="status" required>
                <Select
                  value={formData.status}
                  onValueChange={(value) => handleFieldChange('status', value)}
                >
                  <SelectTrigger id="status">
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
                onChange={(e) => handleFieldChange('registrationDate', e.target.value)}
              />
            </FormField>
          </CardContent>
        </Card>
      </div>
    </EditPanelWrapper>
  );
}

export default AddRegistrationPanel;
