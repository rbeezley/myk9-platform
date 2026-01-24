import React, { useMemo } from 'react';
import { Dialog, DialogContent, DialogOverlay } from '@/components/ui/dialog';
import { Input, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui';
import { Check, X } from 'lucide-react';
import type { Registration } from '@/types/dog-types';
import { getBreedNamesForOrganization, getVarietiesForBreed } from '@/data/breedData';

interface EditRegistrationDialogProps {
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
  newRegistration: Omit<Registration, 'id'>;
  setNewRegistration: (reg: Omit<Registration, 'id'>) => void;
  dogName?: string;
}

const EditRegistrationDialog: React.FC<EditRegistrationDialogProps> = ({
  open,
  onClose,
  onUpdate,
  newRegistration,
  setNewRegistration,
  dogName,
}) => {
  const [formErrors, setFormErrors] = React.useState<{ [key: string]: string }>({});

  // Get breeds for the selected organization
  const availableBreeds = useMemo(() => {
    if (!newRegistration.organization) return [];
    return getBreedNamesForOrganization(newRegistration.organization);
  }, [newRegistration.organization]);

  // Get varieties for the selected breed
  const availableVarieties = useMemo(() => {
    if (!newRegistration.organization || !newRegistration.breed) return [];
    return getVarietiesForBreed(newRegistration.organization, newRegistration.breed);
  }, [newRegistration.organization, newRegistration.breed]);

  // Handle organization change - clear breed and variety
  const handleOrganizationChange = (value: string) => {
    setNewRegistration({
      ...newRegistration,
      organization: value,
      breed: '',
      variety: ''
    });
  };

  // Handle breed change - clear variety if breed changes
  const handleBreedChange = (value: string) => {
    setNewRegistration({
      ...newRegistration,
      breed: value,
      variety: ''
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { [key: string]: string } = {};
    if (!newRegistration.organization) errors.organization = 'Organization is required.';
    if (!newRegistration.registeredName) errors.registeredName = 'Registered Name is required.';
    if (!newRegistration.breed) errors.breed = 'Breed is required.';
    if (!newRegistration.registrationNumber) errors.registrationNumber = 'Registration Number is required.';
    if (!newRegistration.status) errors.status = 'Status is required.';
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    onUpdate();
    setFormErrors({});
    onClose();
  };

  const isValid = newRegistration.organization && newRegistration.registeredName && newRegistration.breed && newRegistration.registrationNumber && newRegistration.status;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogOverlay className="dialog-overlay" />
      <DialogContent className="dialog-content max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="dialog-header flex-shrink-0">
          <h2 className="dialog-title">Edit Registration</h2>
          <p className="dialog-description">
            Update registration information{dogName ? ` for ${dogName}` : ''}.
          </p>
        </div>

        {/* Form - scrollable area */}
        <form onSubmit={handleSubmit} className="space-y-6 overflow-y-auto flex-1 pr-2">
          {/* Organization Field */}
          <div className="space-y-2">
            <Label className="dialog-label">
              Organization
              <span className="text-red-500">*</span>
            </Label>
            <Select
              value={newRegistration.organization}
              onValueChange={handleOrganizationChange}
            >
              <SelectTrigger 
                className={formErrors.organization ? 'error' : ''}
              >
                <SelectValue placeholder="Select organization" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AKC">American Kennel Club (AKC)</SelectItem>
                <SelectItem value="UKC">United Kennel Club (UKC)</SelectItem>
                <SelectItem value="CKC">Canadian Kennel Club (CKC)</SelectItem>
                <SelectItem value="FCI">Fédération Cynologique Internationale (FCI)</SelectItem>
                <SelectItem value="KC">The Kennel Club (UK)</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
            {formErrors.organization && (
              <div className="error-message">{formErrors.organization}</div>
            )}
          </div>

          {/* Registered Name Field */}
          <div className="space-y-2">
            <Label className="dialog-label">
              Registered Name
              <span className="text-red-500">*</span>
            </Label>
            <Input
              className={formErrors.registeredName ? 'error' : ''}
              value={newRegistration.registeredName}
              onChange={e => setNewRegistration({ ...newRegistration, registeredName: e.target.value })}
              placeholder="Enter registered name"
            />
            {formErrors.registeredName && (
              <div className="error-message">{formErrors.registeredName}</div>
            )}
          </div>

          {/* Two-column grid for Breed and Variety */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="dialog-label">
                Breed
                <span className="text-red-500">*</span>
              </Label>
              <Select
                value={newRegistration.breed}
                onValueChange={handleBreedChange}
                disabled={!newRegistration.organization}
              >
                <SelectTrigger
                  className={formErrors.breed ? 'error' : ''}
                >
                  <SelectValue placeholder={newRegistration.organization ? "Select breed" : "Select organization first"} />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {availableBreeds.map(breed => (
                    <SelectItem key={breed} value={breed}>
                      {breed}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors.breed && (
                <div className="error-message">{formErrors.breed}</div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="dialog-label">Variety</Label>
              {availableVarieties.length > 0 ? (
                <Select
                  value={newRegistration.variety || ''}
                  onValueChange={value => setNewRegistration({ ...newRegistration, variety: value })}
                >
                  <SelectTrigger>
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
                  value={newRegistration.variety || ''}
                  onChange={e => setNewRegistration({ ...newRegistration, variety: e.target.value })}
                  placeholder={newRegistration.breed ? "No varieties for this breed" : "Select breed first"}
                  disabled={!newRegistration.breed}
                />
              )}
            </div>
          </div>

          {/* Registration Number Field */}
          <div className="space-y-2">
            <Label className="dialog-label">
              Registration Number
              <span className="text-red-500">*</span>
            </Label>
            <Input
              className={formErrors.registrationNumber ? 'error' : ''}
              value={newRegistration.registrationNumber}
              onChange={e => setNewRegistration({ ...newRegistration, registrationNumber: e.target.value })}
              placeholder="Enter registration number"
            />
            {formErrors.registrationNumber && (
              <div className="error-message">{formErrors.registrationNumber}</div>
            )}
          </div>

          {/* Two-column grid for Status and Registration Date */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="dialog-label">
                Status
                <span className="text-red-500">*</span>
              </Label>
              <Select
                value={newRegistration.status}
                onValueChange={value => setNewRegistration({ ...newRegistration, status: value })}
              >
                <SelectTrigger 
                  className={formErrors.status ? 'error' : ''}
                >
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Expired">Expired</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Under review">Under review</SelectItem>
                </SelectContent>
              </Select>
              {formErrors.status && (
                <div className="error-message">{formErrors.status}</div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="dialog-label">Registration Date</Label>
              <Input
                type="date"
                value={newRegistration.registrationDate}
                onChange={(e) => setNewRegistration({ ...newRegistration, registrationDate: e.target.value })}
              />
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="dialog-footer flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="button-secondary"
          >
            <X className="w-4 h-4" />
            Cancel
          </button>
          <button
            type="submit"
            disabled={!isValid}
            onClick={handleSubmit}
            className="button-primary"
          >
            <Check className="w-4 h-4" />
            Save Changes
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditRegistrationDialog;