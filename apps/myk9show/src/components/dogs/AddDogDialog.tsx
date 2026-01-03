import React, { useState, useEffect } from 'react';
import { AppleDialog, AppleFormField, AppleFormGrid } from '@/components/ui/AppleDialog';
import { Input } from '@/components/ui/input';
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

// Import Apple dialog styles
import '@/styles/apple-dialogs-global.css';

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

// Common dog breeds for quick selection (used in AddEditRegistrationDialog)
// const COMMON_BREEDS = [
//   'Australian Cattle Dog',
//   'Australian Shepherd',
//   'Border Collie',
//   'Golden Retriever',
//   'Labrador Retriever',
//   'German Shepherd Dog',
//   'Poodle',
//   'Standard Poodle',
//   'Miniature Poodle',
//   'Belgian Malinois',
//   'Siberian Husky',
//   'Jack Russell Terrier',
//   'Papillon',
//   'Shetland Sheepdog',
//   'Shih Tzu',
//   'Pembroke Welsh Corgi',
//   'Mixed Breed',
//   'All American Dog'
// ];

// Registration organizations (used in AddEditRegistrationDialog)
// const REGISTRATION_ORGS = [
//   'AKC (American Kennel Club)',
//   'UKC (United Kennel Club)', 
//   'CKC (Canadian Kennel Club)',
//   'ILP (Indefinite Listing Privilege)',
//   'PAL (Purebred Alternative Listing)',
//   'Mixed Breed',
//   'Other'
// ];

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

  // Initialize owner ID based on role
  useEffect(() => {
    if (userRole === UserRole.EXHIBITOR && currentUserPersonId && !formData.ownerId) {
      setFormData(prev => ({ ...prev, ownerId: currentUserPersonId }));
    }
  }, [userRole, currentUserPersonId, formData.ownerId]);

  // Clear errors when dialog opens
  useEffect(() => {
    if (open) {
      setValidationErrors({});
    }
  }, [open]);

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
      console.error('Error creating dog:', error);
      // Show error to user
      setValidationErrors({ 
        submit: error instanceof Error ? error.message : 'Failed to create dog' 
      });
    } finally {
      setIsCreating(false);
    }
  };

  // Check if form is valid
  const isFormValid = (): boolean => {
    const errors = validateForm(formData);
    return Object.keys(errors).length === 0;
  };

  // Check if tab is valid
  const isTabValid = (tab: string): boolean => {
    const errors = validateForm(formData);
    switch (tab) {
      case 'basic':
        return !errors.callName && !errors.gender && !errors.dateOfBirth && !errors.ownerId;
      case 'registration':
        // If no registrations, the tab is valid (no errors to show)
        if (formData.registrations.length === 0) return true;
        // Check if all registrations are valid
        return formData.registrations.every((_, index) => 
          !errors[`registration-${index}-organization`] &&
          !errors[`registration-${index}-registeredName`] &&
          !errors[`registration-${index}-breed`] &&
          !errors[`registration-${index}-registrationNumber`]
        );
      case 'optional':
        return true; // Optional fields don't have validation
      default:
        return true;
    }
  };

  return (
    <AppleDialog
      open={open}
      onOpenChange={onOpenChange}
      onSave={handleSubmit}
      onCancel={() => onOpenChange(false)}
      title="Add New Dog"
      saveLabel={isCreating || isSaving ? 'Creating...' : 'Create Dog'}
      saveDisabled={isCreating || isSaving || !isFormValid()}
      maxWidth="5xl"
    >
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'basic' | 'registration' | 'optional')}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger 
            value="basic" 
            className={`flex items-center gap-2 ${!isTabValid('basic') ? 'text-red-600' : ''}`}
          >
            Basic Info *
            {isTabValid('basic') && <CheckCircle className="h-4 w-4 text-green-600" />}
          </TabsTrigger>
          <TabsTrigger 
            value="registration"
            className={`flex items-center gap-2 ${!isTabValid('registration') ? 'text-red-600' : ''}`}
          >
            Registration
            {isTabValid('registration') && <CheckCircle className="h-4 w-4 text-green-600" />}
          </TabsTrigger>
          <TabsTrigger 
            value="optional"
            className={`flex items-center gap-2 ${!isTabValid('optional') ? 'text-red-600' : ''}`}
          >
            Additional Info
            {isTabValid('optional') && <CheckCircle className="h-4 w-4 text-green-600" />}
          </TabsTrigger>
        </TabsList>

        {/* Error Display */}
        {(saveError || validationErrors.submit) && (
          <Alert className="border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              {saveError || validationErrors.submit}
            </AlertDescription>
          </Alert>
        )}

        {/* Basic Info Tab */}
        <TabsContent value="basic" className="space-y-6 mt-6">
          <AppleFormGrid columns={2}>
            <AppleFormField 
              label="Call Name" 
              required 
              error={validationErrors.callName}
            >
              <Input
                value={formData.callName}
                onChange={(e) => handleFieldChange('callName', e.target.value)}
                placeholder="Everyday name"
                className="form-input"
              />
            </AppleFormField>
          </AppleFormGrid>

          <AppleFormField 
            label="Gender" 
            required 
            error={validationErrors.gender}
          >
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
          </AppleFormField>

          <AppleFormField 
            label="Date of Birth" 
            required 
            error={validationErrors.dateOfBirth}
          >
            <Input
              type="date"
              value={formData.dateOfBirth}
              onChange={(e) => handleFieldChange('dateOfBirth', e.target.value)}
              className="form-input"
            />
            {formData.dateOfBirth && !validationErrors.dateOfBirth && (
              <p className="text-xs text-muted-foreground mt-1">
                Age: {calculateAge(formData.dateOfBirth)}
              </p>
            )}
          </AppleFormField>

          <AppleFormField label="Color/Markings">
            <Input
              value={formData.color}
              onChange={(e) => handleFieldChange('color', e.target.value)}
              placeholder="e.g., Black & White, Red, Blue Merle"
              className="form-input"
            />
          </AppleFormField>

          {/* Owner Selection - Show for Secretary/Admin, hidden for Exhibitor */}
          {(userRole === UserRole.SECRETARY || userRole === UserRole.CLUB_ADMIN || userRole === UserRole.SITE_ADMIN) && (
            <AppleFormField 
              label="Owner" 
              required 
              error={validationErrors.ownerId}
            >
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
            </AppleFormField>
          )}

          {/* Show current owner for Exhibitor role */}
          {userRole === UserRole.EXHIBITOR && currentUserPersonId && (
            <AppleFormField label="Owner">
              <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                <User className="h-4 w-4" />
                <span className="text-sm">
                  {(() => {
                    const currentPerson = people.find(p => p.id === currentUserPersonId);
                    return currentPerson ? `${currentPerson.firstName} ${currentPerson.lastName}` : 'You';
                  })()}
                </span>
              </div>
            </AppleFormField>
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
          <AppleFormGrid columns={2}>
            <AppleFormField label="Height (inches)">
              <Input
                value={formData.height}
                onChange={(e) => handleFieldChange('height', e.target.value)}
                placeholder="e.g., 24"
                type="number"
                step="0.1"
                className="form-input"
              />
            </AppleFormField>

            <AppleFormField label="Weight (pounds)">
              <Input
                value={formData.weight}
                onChange={(e) => handleFieldChange('weight', e.target.value)}
                placeholder="e.g., 55"
                type="number"
                step="0.1"
                className="form-input"
              />
            </AppleFormField>
          </AppleFormGrid>

          <AppleFormField label="Microchip Number">
            <Input
              value={formData.microchip}
              onChange={(e) => handleFieldChange('microchip', e.target.value)}
              placeholder="15-digit microchip number"
              className="form-input"
            />
          </AppleFormField>

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

      <AddEditRegistrationDialog
        open={isAddEditRegDialogOpen}
        onOpenChange={setIsAddEditRegDialogOpen}
        onSave={handleSaveRegistration}
        initialData={currentRegToEdit}
      />
    </AppleDialog>
  );
};