import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, CheckCircle, PlusCircle, Edit, Trash2, User } from 'lucide-react';
import { Dog, Registration } from '@/types/dog-types';
import { UserRole } from '@/types/auth-types';
import { AddEditRegistrationDialog } from './AddEditRegistrationDialog';
import { useUserStore } from '@/store/userStore';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { DogInput } from '@/store/dogStore';

import { logger } from '@/services/LoggingService';

interface AddDogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDogCreated: (dog: Dog) => void;
  userRole?: UserRole;
  currentUserPersonId?: string;
}

interface DogFormData {
  // Basic Information
  callName: string;
  gender: 'Male' | 'Female' | '';
  dateOfBirth: string;
  color: string;

  // Optional Information
  height: string;
  weight: string;
  microchip: string;
  spayedNeutered: boolean;

  // Owner Information
  ownerId: string;

  // Registration Information (can be multiple)
  registrations: Registration[];
}

const INITIAL_FORM_DATA: DogFormData = {
  callName: '',
  gender: '',
  dateOfBirth: '',
  color: '',
  height: '',
  weight: '',
  microchip: '',
  spayedNeutered: false,
  ownerId: '',
  registrations: []
};

export const AddDogDialog: React.FC<AddDogDialogProps> = ({
  open,
  onOpenChange,
  onDogCreated,
  userRole = UserRole.EXHIBITOR,
  currentUserPersonId
}) => {
  const people = useUserStore(state => state.people);
  const { addDog, isLoading: isSaving, error: saveError } = useDogStoreCompat();
  const [formData, setFormData] = useState<DogFormData>(INITIAL_FORM_DATA);
  const [activeTab, setActiveTab] = useState<'basic' | 'registration' | 'optional'>('basic');
  const [isCreating, setIsCreating] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const [isAddEditRegDialogOpen, setIsAddEditRegDialogOpen] = useState(false);
  const [currentRegToEdit, setCurrentRegToEdit] = useState<Registration | undefined>(undefined);
  // Track if form has been submitted - only show errors after first submit attempt
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Initialize owner ID based on role
  useEffect(() => {
    if (userRole === UserRole.EXHIBITOR && currentUserPersonId && !formData.ownerId) {
      setFormData(prev => ({ ...prev, ownerId: currentUserPersonId }));
    }
  }, [userRole, currentUserPersonId, formData.ownerId]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      const initialData = {
        ...INITIAL_FORM_DATA,
        // Set default owner based on user role
        ownerId: userRole === UserRole.EXHIBITOR ? (currentUserPersonId || '') : ''
      };
      setFormData(initialData);
      setActiveTab('basic');
      setValidationErrors({});
      setHasSubmitted(false); // Reset submit tracking for clean slate
    }
  }, [open, userRole, currentUserPersonId]);

  // Form validation
  const validateForm = (data: DogFormData): Record<string, string> => {
    const errors: Record<string, string> = {};

    // Basic information validation
    if (!data.callName.trim()) errors.callName = 'Call name is required';
    if (!data.gender) errors.gender = 'Gender is required';
    if (!data.dateOfBirth) errors.dateOfBirth = 'Date of birth is required';
    if (!data.ownerId) errors.ownerId = 'Owner is required';

    // Date validation
    if (data.dateOfBirth) {
      const birthDate = new Date(data.dateOfBirth);
      const now = new Date();
      if (birthDate > now) {
        errors.dateOfBirth = 'Date of birth cannot be in the future';
      }
      if (birthDate < new Date(now.getFullYear() - 30, 0, 1)) {
        errors.dateOfBirth = 'Date of birth seems too far in the past';
      }
    }

    // Registration validation: Validate each registration in the array
    data.registrations.forEach((reg, index) => {
      if (!reg.organization.trim()) errors[`registration-${index}-organization`] = 'Organization is required';
      if (!reg.registeredName.trim()) errors[`registration-${index}-registeredName`] = 'Registered name is required';
      if (!reg.breed.trim()) errors[`registration-${index}-breed`] = 'Breed is required';
      if (!reg.registrationNumber.trim()) errors[`registration-${index}-registrationNumber`] = 'Registration number is required';
    });

    return errors;
  };

  // Handle form field changes (for top-level DogFormData fields)
  const handleFieldChange = (field: keyof DogFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));

    // Clear validation error for this field
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  // Handle adding/editing a registration
  const handleSaveRegistration = (newReg: Registration) => {
    setFormData(prev => {
      const existingIndex = prev.registrations.findIndex(r => r.id === newReg.id);
      if (existingIndex > -1) {
        // Edit existing
        const updatedRegistrations = [...prev.registrations];
        updatedRegistrations[existingIndex] = newReg;
        return { ...prev, registrations: updatedRegistrations };
      } else {
        // Add new
        return { ...prev, registrations: [...prev.registrations, newReg] };
      }
    });
    setIsAddEditRegDialogOpen(false);
    setCurrentRegToEdit(undefined);
  };

  // Handle removing a registration
  const handleRemoveRegistration = (id: string) => {
    setFormData(prev => ({
      ...prev,
      registrations: prev.registrations.filter(reg => reg.id !== id)
    }));
  };

  // Calculate age from date of birth
  const calculateAge = (dateOfBirth: string): string => {
    if (!dateOfBirth) return '';

    const birth = new Date(dateOfBirth);
    const now = new Date();
    const years = now.getFullYear() - birth.getFullYear();
    const months = now.getMonth() - birth.getMonth();

    if (years === 0) {
      return `${months + (months === 1 ? ' month' : ' months')}`;
    } else if (months < 0) {
      return `${years - 1} years, ${12 + months} months`;
    } else if (months === 0) {
      return `${years} ${years === 1 ? 'year' : 'years'}`;
    } else {
      return `${years} years, ${months} months`;
    }
  };

  // Handle form submission
  const handleSubmit = async () => {
    // Mark that we've attempted to submit - this enables error display
    setHasSubmitted(true);

    const errors = validateForm(formData);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    setIsCreating(true);
    try {
      // Create DogInput for database
      const dogInput: DogInput = {
        name: formData.callName,
        breed: formData.registrations?.[0]?.breed || 'Mixed Breed',
        birthDate: formData.dateOfBirth,
        sex: formData.gender === 'Female' ? 'female' : 'male',
        color: formData.color,
        weight: formData.weight ? parseFloat(formData.weight) : undefined,
        height: formData.height ? parseFloat(formData.height) : undefined,
        ownerId: formData.ownerId,
        microchipNumber: formData.microchip || undefined,
        // TODO: Handle registrations in separate table/process
        registrations: formData.registrations?.map(reg => ({
          organization: reg.organization,
          number: reg.registrationNumber,
          type: reg.breed,
          status: reg.status || 'active',
        })),
      };

      // Create dog using database integration
      const newDog = await addDog(dogInput);

      onDogCreated(newDog);
      onOpenChange(false);

      // Reset form
      setFormData(INITIAL_FORM_DATA);
      setValidationErrors({});
    } catch (error) {
      logger.error('Error creating dog:', 'dogs', {}, error as Error);
      // Show error to user
      setValidationErrors({
        submit: error instanceof Error ? error.message : 'Failed to create dog'
      });
    } finally {
      setIsCreating(false);
    }
  };

  // Helper to get visible error (only show after first submit attempt)
  const getVisibleError = (field: string): string | undefined => {
    return hasSubmitted ? validationErrors[field] : undefined;
  };

  // Check if tab has errors (only relevant after submission)
  const getTabStatus = (tab: string): 'valid' | 'invalid' | 'pending' => {
    if (!hasSubmitted) return 'pending'; // Don't show status until user tries to submit

    const errors = validateForm(formData);
    switch (tab) {
      case 'basic':
        const basicValid = !errors.callName && !errors.gender && !errors.dateOfBirth && !errors.ownerId;
        return basicValid ? 'valid' : 'invalid';
      case 'registration':
        // If no registrations, the tab is valid (no errors to show)
        if (formData.registrations.length === 0) return 'valid';
        // Check if all registrations are valid
        const regValid = formData.registrations.every((_, index) =>
          !errors[`registration-${index}-organization`] &&
          !errors[`registration-${index}-registeredName`] &&
          !errors[`registration-${index}-breed`] &&
          !errors[`registration-${index}-registrationNumber`]
        );
        return regValid ? 'valid' : 'invalid';
      case 'optional':
        return 'valid'; // Optional fields don't have validation
      default:
        return 'valid';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add New Dog</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'basic' | 'registration' | 'optional')}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger
                value="basic"
                className={`flex items-center gap-2 ${getTabStatus('basic') === 'invalid' ? 'text-red-600' : ''}`}
              >
                Basic Info *
                {getTabStatus('basic') === 'valid' && <CheckCircle className="h-4 w-4 text-green-600" />}
              </TabsTrigger>
              <TabsTrigger
                value="registration"
                className={`flex items-center gap-2 ${getTabStatus('registration') === 'invalid' ? 'text-red-600' : ''}`}
              >
                Registration
                {getTabStatus('registration') === 'valid' && <CheckCircle className="h-4 w-4 text-green-600" />}
              </TabsTrigger>
              <TabsTrigger
                value="optional"
                className={`flex items-center gap-2 ${getTabStatus('optional') === 'invalid' ? 'text-red-600' : ''}`}
              >
                Additional Info
                {getTabStatus('optional') === 'valid' && <CheckCircle className="h-4 w-4 text-green-600" />}
              </TabsTrigger>
            </TabsList>

            {/* Error Display */}
            {(saveError || validationErrors.submit) && (
              <Alert className="border-red-200 bg-red-50 mt-4">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">
                  {saveError || validationErrors.submit}
                </AlertDescription>
              </Alert>
            )}

            {/* Basic Info Tab */}
            <TabsContent value="basic" className="space-y-6 mt-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Call Name <span className="text-destructive">*</span></Label>
                  <Input
                    value={formData.callName}
                    onChange={(e) => handleFieldChange('callName', e.target.value)}
                    placeholder="Everyday name"
                    className="form-input"
                  />
                  {getVisibleError('callName') && (
                    <p className="text-sm text-destructive">{getVisibleError('callName')}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Gender <span className="text-destructive">*</span></Label>
                <Select
                  value={formData.gender}
                  onValueChange={(value) => handleFieldChange('gender', value)}
                >
                  <SelectTrigger className="form-select">
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                  </SelectContent>
                </Select>
                {getVisibleError('gender') && (
                  <p className="text-sm text-destructive">{getVisibleError('gender')}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Date of Birth <span className="text-destructive">*</span></Label>
                <Input
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) => handleFieldChange('dateOfBirth', e.target.value)}
                  className="form-input"
                />
                {formData.dateOfBirth && !getVisibleError('dateOfBirth') && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Age: {calculateAge(formData.dateOfBirth)}
                  </p>
                )}
                {getVisibleError('dateOfBirth') && (
                  <p className="text-sm text-destructive">{getVisibleError('dateOfBirth')}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Color/Markings</Label>
                <Input
                  value={formData.color}
                  onChange={(e) => handleFieldChange('color', e.target.value)}
                  placeholder="e.g., Black & White, Red, Blue Merle"
                  className="form-input"
                />
              </div>

              {/* Owner Selection - Show for Secretary/Admin, hidden for Exhibitor */}
              {(userRole === UserRole.SECRETARY || userRole === UserRole.CLUB_ADMIN || userRole === UserRole.SITE_ADMIN) && (
                <div className="space-y-2">
                  <Label>Owner <span className="text-destructive">*</span></Label>
                  <Select
                    value={formData.ownerId}
                    onValueChange={(value) => handleFieldChange('ownerId', value)}
                  >
                    <SelectTrigger className="form-select">
                      <SelectValue placeholder="Select owner" />
                    </SelectTrigger>
                    <SelectContent>
                      {people.map((person) => (
                        <SelectItem key={person.id} value={person.id}>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            {person.firstName} {person.lastName}
                            {person.email && (
                              <span className="text-xs text-muted-foreground">({person.email})</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {getVisibleError('ownerId') && (
                    <p className="text-sm text-destructive">{getVisibleError('ownerId')}</p>
                  )}
                </div>
              )}

              {/* Show current owner for Exhibitor role */}
              {userRole === UserRole.EXHIBITOR && currentUserPersonId && (
                <div className="space-y-2">
                  <Label>Owner</Label>
                  <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                    <User className="h-4 w-4" />
                    <span className="text-sm">
                      {(() => {
                        const currentPerson = people.find(p => p.id === currentUserPersonId);
                        return currentPerson ? `${currentPerson.firstName} ${currentPerson.lastName}` : 'You';
                      })()}
                    </span>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Registration Tab */}
            <TabsContent value="registration" className="space-y-6 mt-6">
              <div className="space-y-4">
                {formData.registrations.length === 0 && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      No registrations added yet. Click "Add New Registration" to add one.
                    </AlertDescription>
                  </Alert>
                )}

                {formData.registrations.map((reg, index) => (
                  <div key={reg.id || index} className="border p-4 rounded-md shadow-sm">
                    <h4 className="font-semibold">{reg.organization}</h4>
                    <p className="text-sm text-muted-foreground">Registered Name: {reg.registeredName}</p>
                    <p className="text-sm text-muted-foreground">Breed: {reg.breed}</p>
                    <p className="text-sm text-muted-foreground">Number: {reg.registrationNumber}</p>
                    <p className="text-sm text-muted-foreground">Status: {reg.status}</p>
                    <div className="flex space-x-2 mt-2">
                      <button
                        className="text-blue-500 text-sm flex items-center gap-1"
                        onClick={() => {
                          setCurrentRegToEdit(reg);
                          setIsAddEditRegDialogOpen(true);
                        }}
                      >
                        <Edit className="h-4 w-4" /> Edit
                      </button>
                      <button
                        className="text-red-500 text-sm flex items-center gap-1"
                        onClick={() => handleRemoveRegistration(reg.id)}
                      >
                        <Trash2 className="h-4 w-4" /> Remove
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  className="w-full py-2 px-4 border border-dashed rounded-md text-center text-muted-foreground hover:border-solid hover:text-primary flex items-center justify-center gap-2"
                  onClick={() => {
                    setCurrentRegToEdit(undefined);
                    setIsAddEditRegDialogOpen(true);
                  }}
                >
                  <PlusCircle className="h-4 w-4" /> Add New Registration
                </button>
              </div>
            </TabsContent>

            {/* Optional Tab */}
            <TabsContent value="optional" className="space-y-6 mt-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Height (inches)</Label>
                  <Input
                    value={formData.height}
                    onChange={(e) => handleFieldChange('height', e.target.value)}
                    placeholder="e.g., 24"
                    type="number"
                    step="0.1"
                    className="form-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Weight (pounds)</Label>
                  <Input
                    value={formData.weight}
                    onChange={(e) => handleFieldChange('weight', e.target.value)}
                    placeholder="e.g., 55"
                    type="number"
                    step="0.1"
                    className="form-input"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Microchip Number</Label>
                <Input
                  value={formData.microchip}
                  onChange={(e) => handleFieldChange('microchip', e.target.value)}
                  placeholder="15-digit microchip number"
                  className="form-input"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="spayedNeutered"
                  checked={formData.spayedNeutered}
                  onCheckedChange={(checked) => handleFieldChange('spayedNeutered', checked === true)}
                />
                <label htmlFor="spayedNeutered" className="text-sm font-medium">
                  Spayed/Neutered
                </label>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isCreating || isSaving}
          >
            {isCreating || isSaving ? 'Creating...' : 'Create Dog'}
          </Button>
        </DialogFooter>

        <AddEditRegistrationDialog
          open={isAddEditRegDialogOpen}
          onOpenChange={setIsAddEditRegDialogOpen}
          onSave={handleSaveRegistration}
          initialData={currentRegToEdit}
        />
      </DialogContent>
    </Dialog>
  );
};
