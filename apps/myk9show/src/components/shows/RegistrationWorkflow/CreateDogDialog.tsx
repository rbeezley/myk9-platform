import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormField } from '@/components/common/FormField';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Info, CheckCircle } from 'lucide-react';
import { Dog, Registration, User } from '@/types/dog-types';
import { logger } from '@/services/LoggingService';

interface CreateDogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDogCreated: (dog: Dog) => void;
  ownerId?: string | undefined; // If provided, dog will be assigned to this owner
  ownerInfo?: User | undefined; // Owner information for display
  prefilledData?: Partial<DogFormData> | undefined; // Pre-fill from search or other sources
}

interface DogFormData {
  // Basic Information
  registeredName: string;
  callName: string;
  breed: string;
  gender: 'Male' | 'Female' | '';
  dateOfBirth: string;
  color: string;
  height: string;
  weight: string;
  microchip: string;
  spayedNeutered: boolean;
  
  // Registration Information
  hasRegistration: boolean;
  registrationOrg: string;
  registrationNumber: string;
  registrationStatus: string;
}

const INITIAL_FORM_DATA: DogFormData = {
  registeredName: '',
  callName: '',
  breed: '',
  gender: '',
  dateOfBirth: '',
  color: '',
  height: '',
  weight: '',
  microchip: '',
  spayedNeutered: false,
  hasRegistration: false,
  registrationOrg: '',
  registrationNumber: '',
  registrationStatus: 'Active'
};

// Common dog breeds for quick selection
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

// Registration organizations
const REGISTRATION_ORGS = [
  'AKC (American Kennel Club)',
  'UKC (United Kennel Club)', 
  'CKC (Canadian Kennel Club)',
  'ILP (Indefinite Listing Privilege)',
  'PAL (Purebred Alternative Listing)',
  'Mixed Breed',
  'Other'
];

export const CreateDogDialog: React.FC<CreateDogDialogProps> = ({
  open,
  onOpenChange,
  onDogCreated,
  ownerId,
  ownerInfo,
  prefilledData
}) => {
  const [formData, setFormData] = useState<DogFormData>(INITIAL_FORM_DATA);
  const [activeTab, setActiveTab] = useState<'basic' | 'registration' | 'optional'>('basic');
  const [isCreating, setIsCreating] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  // Track if form has been submitted - only show errors after first submit attempt
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Helper to get visible error (only show after first submit attempt)
  const getVisibleError = (field: string): string | undefined => {
    return hasSubmitted ? validationErrors[field] : undefined;
  };

  // Initialize form with prefilled data
  React.useEffect(() => {
    if (prefilledData && open) {
      setFormData(prev => ({ ...prev, ...prefilledData }));
    }
  }, [prefilledData, open]);

  // Form validation
  const validateForm = (data: DogFormData): Record<string, string> => {
    const errors: Record<string, string> = {};

    // Basic information validation
    if (!data.registeredName.trim()) errors.registeredName = 'Please enter a registered name';
    if (!data.callName.trim()) errors.callName = 'Please enter a call name';
    if (!data.breed.trim()) errors.breed = 'Please select a breed';
    if (!data.gender) errors.gender = 'Please select a gender';
    if (!data.dateOfBirth) errors.dateOfBirth = 'Please enter a date of birth';

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

    // Registration validation
    if (data.hasRegistration) {
      if (!data.registrationOrg) errors.registrationOrg = 'Please select a registration organization';
      if (!data.registrationNumber.trim()) errors.registrationNumber = 'Please enter a registration number';
    }

    // Weight/height validation
    if (data.weight && isNaN(Number(data.weight))) {
      errors.weight = 'Weight must be a number';
    }
    if (data.height && isNaN(Number(data.height))) {
      errors.height = 'Height must be a number';
    }

    return errors;
  };

  // Handle form field changes
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

    // Auto-fill call name if registered name is entered and call name is empty
    if (field === 'registeredName' && typeof value === 'string' && !formData.callName) {
      const suggestedCallName = value.split(' ').pop() || value;
      setFormData(prev => ({ ...prev, callName: suggestedCallName }));
    }
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

      // Switch to the tab with errors
      if (errors.registeredName || errors.callName || errors.breed || errors.gender || errors.dateOfBirth) {
        setActiveTab('basic');
      } else if (errors.registrationOrg || errors.registrationNumber) {
        setActiveTab('registration');
      } else {
        setActiveTab('optional');
      }
      return;
    }

    setIsCreating(true);
    try {
      // Create registration object if needed
      const registrations: Registration[] = [];
      if (formData.hasRegistration) {
        registrations.push({
          id: `reg-${Date.now()}`,
          organization: formData.registrationOrg,
          registeredName: formData.registeredName,
          breed: formData.breed,
          registrationNumber: formData.registrationNumber,
          status: formData.registrationStatus,
          registrationDate: new Date().toISOString().split('T')[0]
        });
      }

      // Calculate age
      const birthDate = new Date(formData.dateOfBirth);
      const now = new Date();
      const ageInMonths = (now.getFullYear() - birthDate.getFullYear()) * 12 + (now.getMonth() - birthDate.getMonth());
      const ageInYears = Math.floor(ageInMonths / 12);

      // Create new dog
      const newDog: Dog = {
        id: `dog-${Date.now()}`,
        name: formData.registeredName,
        breed: formData.breed, // Required field
        sex: formData.gender === 'Female' ? 'female' : 'male', // Required field
        callName: formData.callName,
        gender: formData.gender,
        age: ageInYears,
        ownerId: ownerId || 'temp-owner-id',
        description: `${formData.breed} - ${formData.gender}`,
        dateOfBirth: formData.dateOfBirth,
        color: formData.color,
        height: formData.height,
        weight: formData.weight,
        microchip: formData.microchip,
        spayedNeutered: formData.spayedNeutered,
        registrations: registrations.length > 0 ? registrations : undefined
      };

      // In real app, this would be an API call
      await new Promise(resolve => setTimeout(resolve, 500));

      onDogCreated(newDog);
      handleClose();
    } catch (error) {
      logger.error('Error creating dog:', 'shows', {}, error as Error);
    } finally {
      setIsCreating(false);
    }
  };

  // Handle dialog close
  const handleClose = () => {
    setFormData(INITIAL_FORM_DATA);
    setActiveTab('basic');
    setValidationErrors({});
    setHasSubmitted(false);
    onOpenChange(false);
  };

  // Check if form is valid for current tab
  const isTabValid = (tab: string): boolean => {
    const errors = validateForm(formData);
    switch (tab) {
      case 'basic':
        return !errors.registeredName && !errors.callName && !errors.breed && !errors.gender && !errors.dateOfBirth;
      case 'registration':
        return !formData.hasRegistration || (!errors.registrationOrg && !errors.registrationNumber);
      case 'optional':
        return !errors.weight && !errors.height;
      default:
        return true;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            Add New Dog
            {ownerInfo && (
              <span className="text-sm font-normal text-gray-600">
                for {ownerInfo.firstName} {ownerInfo.lastName}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

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

          <TabsContent value="basic" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Registered Name" fieldId="registeredName" required error={getVisibleError('registeredName')}>
                <Input
                  id="registeredName"
                  value={formData.registeredName}
                  onChange={(e) => handleFieldChange('registeredName', e.target.value)}
                  placeholder="Full registered name"
                  aria-invalid={!!getVisibleError('registeredName')}
                  aria-describedby={getVisibleError('registeredName') ? 'registeredName-error' : undefined}
                />
              </FormField>

              <FormField label="Call Name" fieldId="callName" required error={getVisibleError('callName')}>
                <Input
                  id="callName"
                  value={formData.callName}
                  onChange={(e) => handleFieldChange('callName', e.target.value)}
                  placeholder="Everyday name"
                  aria-invalid={!!getVisibleError('callName')}
                  aria-describedby={getVisibleError('callName') ? 'callName-error' : undefined}
                />
              </FormField>
            </div>

            <FormField label="Breed" fieldId="breed" required error={getVisibleError('breed')}>
              <Select
                value={formData.breed}
                onValueChange={(value) => handleFieldChange('breed', value)}
              >
                <SelectTrigger aria-invalid={!!getVisibleError('breed')}>
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
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Gender" fieldId="gender" required error={getVisibleError('gender')}>
                <Select
                  value={formData.gender}
                  onValueChange={(value) => handleFieldChange('gender', value)}
                >
                  <SelectTrigger aria-invalid={!!getVisibleError('gender')}>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>

              <FormField label="Date of Birth" fieldId="dateOfBirth" required error={getVisibleError('dateOfBirth')} hint={formData.dateOfBirth ? `Age: ${calculateAge(formData.dateOfBirth)}` : undefined}>
                <Input
                  id="dateOfBirth"
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) => handleFieldChange('dateOfBirth', e.target.value)}
                  aria-invalid={!!getVisibleError('dateOfBirth')}
                  aria-describedby={getVisibleError('dateOfBirth') ? 'dateOfBirth-error' : undefined}
                />
              </FormField>
            </div>

            <FormField label="Color/Markings" fieldId="color">
              <Input
                id="color"
                value={formData.color}
                onChange={(e) => handleFieldChange('color', e.target.value)}
                placeholder="e.g., Black & White, Red, Blue Merle"
              />
            </FormField>
          </TabsContent>

          <TabsContent value="registration" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="h-5 w-5" />
                  Registration Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="hasRegistration"
                    checked={formData.hasRegistration}
                    onCheckedChange={(checked) => handleFieldChange('hasRegistration', checked === true)}
                  />
                  <Label htmlFor="hasRegistration">
                    This dog has a formal registration
                  </Label>
                </div>

                {formData.hasRegistration && (
                  <>
                    <FormField label="Registration Organization" fieldId="registrationOrg" required error={getVisibleError('registrationOrg')}>
                      <Select
                        value={formData.registrationOrg}
                        onValueChange={(value) => handleFieldChange('registrationOrg', value)}
                      >
                        <SelectTrigger aria-invalid={!!getVisibleError('registrationOrg')}>
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
                    </FormField>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField label="Registration Number" fieldId="registrationNumber" required error={getVisibleError('registrationNumber')}>
                        <Input
                          id="registrationNumber"
                          value={formData.registrationNumber}
                          onChange={(e) => handleFieldChange('registrationNumber', e.target.value)}
                          placeholder="Enter registration number"
                          aria-invalid={!!getVisibleError('registrationNumber')}
                          aria-describedby={getVisibleError('registrationNumber') ? 'registrationNumber-error' : undefined}
                        />
                      </FormField>

                      <FormField label="Status" fieldId="registrationStatus">
                        <Select
                          value={formData.registrationStatus}
                          onValueChange={(value) => handleFieldChange('registrationStatus', value)}
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
                      </FormField>
                    </div>
                  </>
                )}

                {!formData.hasRegistration && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      No registration information will be stored. This is fine for mixed breeds or dogs 
                      without formal registration papers.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="optional" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Height (inches)" fieldId="height" error={getVisibleError('height')}>
                <Input
                  id="height"
                  value={formData.height}
                  onChange={(e) => handleFieldChange('height', e.target.value)}
                  placeholder="e.g., 24"
                  type="number"
                  step="0.1"
                  aria-invalid={!!getVisibleError('height')}
                  aria-describedby={getVisibleError('height') ? 'height-error' : undefined}
                />
              </FormField>

              <FormField label="Weight (pounds)" fieldId="weight" error={getVisibleError('weight')}>
                <Input
                  id="weight"
                  value={formData.weight}
                  onChange={(e) => handleFieldChange('weight', e.target.value)}
                  placeholder="e.g., 55"
                  type="number"
                  step="0.1"
                  aria-invalid={!!getVisibleError('weight')}
                  aria-describedby={getVisibleError('weight') ? 'weight-error' : undefined}
                />
              </FormField>
            </div>

            <FormField label="Microchip Number" fieldId="microchip">
              <Input
                id="microchip"
                value={formData.microchip}
                onChange={(e) => handleFieldChange('microchip', e.target.value)}
                placeholder="15-digit microchip number"
              />
            </FormField>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="spayedNeutered"
                checked={formData.spayedNeutered}
                onCheckedChange={(checked) => handleFieldChange('spayedNeutered', checked === true)}
              />
              <Label htmlFor="spayedNeutered">
                Spayed/Neutered
              </Label>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-between pt-4 border-t">
          <div className="flex gap-2">
            {activeTab !== 'basic' && (
              <Button
                variant="outline"
                onClick={() => {
                  const tabs = ['basic', 'registration', 'optional'];
                  const currentIndex = tabs.indexOf(activeTab);
                  setActiveTab(tabs[currentIndex - 1] as 'basic' | 'registration' | 'optional');
                }}
              >
                Previous
              </Button>
            )}
            {activeTab !== 'optional' && (
              <Button
                variant="outline"
                onClick={() => {
                  const tabs = ['basic', 'registration', 'optional'];
                  const currentIndex = tabs.indexOf(activeTab);
                  setActiveTab(tabs[currentIndex + 1] as 'basic' | 'registration' | 'optional');
                }}
                disabled={!isTabValid(activeTab)}
              >
                Next
              </Button>
            )}
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isCreating}
              className="min-w-[100px]"
            >
              {isCreating ? 'Creating...' : 'Create Dog'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};