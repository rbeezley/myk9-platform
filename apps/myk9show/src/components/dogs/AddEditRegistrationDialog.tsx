import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Registration } from '@/types/dog-types';

interface AddEditRegistrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (registration: Registration) => void;
  initialData?: Registration; // For editing existing registration
}

const COMMON_BREEDS = [
  'Australian Cattle Dog',
  'Australian Shepherd',
  'Border Collie',
  'Golden Retriever',
  'Labrador Retriever',
  'German Shepherd Dog',
  'Poodle',
  'Standard Poodle',
  'Miniature Poodle',
  'Belgian Malinois',
  'Siberian Husky',
  'Jack Russell Terrier',
  'Papillon',
  'Shetland Sheepdog',
  'Shih Tzu',
  'Pembroke Welsh Corgi',
  'Mixed Breed',
  'All American Dog'
];

const REGISTRATION_ORGS = [
  'AKC (American Kennel Club)',
  'UKC (United Kennel Club)',
  'CKC (Canadian Kennel Club)',
  'ILP (Indefinite Listing Privilege)',
  'PAL (Purebred Alternative Listing)',
  'Mixed Breed',
  'Other'
];

const INITIAL_REGISTRATION_DATA: Registration = {
  id: '',
  organization: '',
  registeredName: '',
  breed: '',
  registrationNumber: '',
  status: 'Active',
};

export const AddEditRegistrationDialog: React.FC<AddEditRegistrationDialogProps> = ({
  open,
  onOpenChange,
  onSave,
  initialData,
}) => {
  const [registrationData, setRegistrationData] = useState<Registration>(initialData || INITIAL_REGISTRATION_DATA);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setRegistrationData(initialData || INITIAL_REGISTRATION_DATA);
      setValidationErrors({});
    }
  }, [open, initialData]);

  const validateForm = (data: Registration): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!data.organization.trim()) errors.organization = 'Organization is required';
    if (!data.registeredName.trim()) errors.registeredName = 'Registered name is required';
    if (!data.breed.trim()) errors.breed = 'Breed is required';
    if (!data.registrationNumber.trim()) errors.registrationNumber = 'Registration number is required';
    return errors;
  };

  const handleFieldChange = (field: keyof Registration, value: string) => {
    setRegistrationData(prev => ({ ...prev, [field]: value }));
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleSubmit = () => {
    const errors = validateForm(registrationData);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    onSave({ ...registrationData, id: registrationData.id || `reg-${Date.now()}` });
    onOpenChange(false);
  };

  const isFormValid = (): boolean => {
    const errors = validateForm(registrationData);
    return Object.keys(errors).length === 0;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initialData ? "Edit Registration" : "Add New Registration"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Registration Organization <span className="text-destructive">*</span></Label>
            <Select
              value={registrationData.organization}
              onValueChange={(value) => handleFieldChange('organization', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select organization" />
              </SelectTrigger>
              <SelectContent>
                {REGISTRATION_ORGS.map(org => (
                  <SelectItem key={org} value={org}>
                    {org}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {validationErrors.organization && (
              <p className="text-sm text-destructive">{validationErrors.organization}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Registered Name <span className="text-destructive">*</span></Label>
            <Input
              value={registrationData.registeredName}
              onChange={(e) => handleFieldChange('registeredName', e.target.value)}
              placeholder="Full registered name"
            />
            {validationErrors.registeredName && (
              <p className="text-sm text-destructive">{validationErrors.registeredName}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Registered Breed <span className="text-destructive">*</span></Label>
            <Select
              value={registrationData.breed}
              onValueChange={(value) => handleFieldChange('breed', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select breed" />
              </SelectTrigger>
              <SelectContent>
                {COMMON_BREEDS.map(breed => (
                  <SelectItem key={breed} value={breed}>
                    {breed}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {validationErrors.breed && (
              <p className="text-sm text-destructive">{validationErrors.breed}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Registration Number <span className="text-destructive">*</span></Label>
              <Input
                value={registrationData.registrationNumber}
                onChange={(e) => handleFieldChange('registrationNumber', e.target.value)}
                placeholder="Enter registration number"
              />
              {validationErrors.registrationNumber && (
                <p className="text-sm text-destructive">{validationErrors.registrationNumber}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={registrationData.status}
                onValueChange={(value) => handleFieldChange('status', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isFormValid()}>
            Save Registration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
