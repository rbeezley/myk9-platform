import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/common/FormField';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { User as UserIcon, AlertTriangle, CheckCircle } from 'lucide-react';
import { User } from '@/types/dog-types';
import { logger } from '@/services/LoggingService';

interface CreateExhibitorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExhibitorCreated: (exhibitor: User) => void;
  onDuplicateSelected?: (existingExhibitor: User) => void;
  searchQuery?: string; // Pre-fill from search if provided
}

interface DuplicateCandidate {
  person: User;
  matchScore: number;
  matchReasons: string[];
}

interface ExhibitorFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
}

const INITIAL_FORM_DATA: ExhibitorFormData = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  streetAddress: '',
  city: '',
  state: '',
  zipCode: ''
};

export const CreateExhibitorDialog: React.FC<CreateExhibitorDialogProps> = ({
  open,
  onOpenChange,
  onExhibitorCreated,
  onDuplicateSelected,
  searchQuery = ''
}) => {
  const [formData, setFormData] = useState<ExhibitorFormData>(INITIAL_FORM_DATA);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [activeTab, setActiveTab] = useState<'create' | 'duplicates'>('create');
  const [isCreating, setIsCreating] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Partial<ExhibitorFormData>>({});
  // Track if form has been submitted - only show errors after first submit attempt
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Mock people data for duplicate detection (in real app, this would come from a store/API)
  const mockUsers: User[] = [
    {
      id: '1',
      firstName: 'John',
      lastName: 'Smith',
      email: 'john.smith@email.com',
      phone: '555-0123',
      streetAddress: '123 Main St',
      city: 'Anytown',
      state: 'CA',
      zipCode: '12345',
      dogs: []
    },
    // Add more mock data as needed
  ];

  // Initialize form with search query if provided
  React.useEffect(() => {
    if (searchQuery && open) {
      // Try to parse search query for name parts
      const parts = searchQuery.split(' ');
      if (parts.length >= 2) {
        setFormData(prev => ({
          ...prev,
          firstName: parts[0],
          lastName: parts.slice(1).join(' ')
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          lastName: searchQuery
        }));
      }
    }
  }, [searchQuery, open]);

  // Duplicate detection logic
  const detectDuplicates = (data: ExhibitorFormData): DuplicateCandidate[] => {
    const candidates: DuplicateCandidate[] = [];

    mockUsers.forEach(person => {
      const matchReasons: string[] = [];
      let score = 0;

      // Name matching (high weight)
      const firstNameMatch = person.firstName.toLowerCase() === data.firstName.toLowerCase();
      const lastNameMatch = person.lastName.toLowerCase() === data.lastName.toLowerCase();
      
      if (firstNameMatch && lastNameMatch) {
        score += 90;
        matchReasons.push('Exact name match');
      } else if (lastNameMatch) {
        score += 40;
        matchReasons.push('Last name match');
      } else if (firstNameMatch) {
        score += 20;
        matchReasons.push('First name match');
      }

      // Email matching (high weight)
      if (data.email && person.email === data.email) {
        score += 80;
        matchReasons.push('Email match');
      }

      // Phone matching (medium weight)
      if (data.phone && person.phone === data.phone) {
        score += 60;
        matchReasons.push('Phone match');
      }

      // Address matching (lower weight)
      if (data.streetAddress && person.streetAddress === data.streetAddress) {
        score += 30;
        matchReasons.push('Address match');
      }

      // ZIP code matching (lower weight)
      if (data.zipCode && person.zipCode === data.zipCode) {
        score += 10;
        matchReasons.push('ZIP code match');
      }

      // Only include candidates with meaningful scores
      if (score >= 30) {
        candidates.push({
          person,
          matchScore: score,
          matchReasons
        });
      }
    });

    return candidates.sort((a, b) => b.matchScore - a.matchScore);
  };

  // Form validation
  const validateForm = (data: ExhibitorFormData): Partial<ExhibitorFormData> => {
    const errors: Partial<ExhibitorFormData> = {};

    if (!data.firstName.trim()) errors.firstName = 'Please enter a first name';
    if (!data.lastName.trim()) errors.lastName = 'Please enter a last name';
    if (!data.email.trim()) {
      errors.email = 'Please enter an email address';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errors.email = 'Please enter a valid email address';
    }
    if (!data.phone.trim()) errors.phone = 'Please enter a phone number';

    return errors;
  };

  // Handle form field changes
  const handleFieldChange = (field: keyof ExhibitorFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear validation error for this field
    if (validationErrors[field]) {
      setValidationErrors(prev => ({ ...prev, [field]: undefined }));
    }

    // Re-run duplicate detection on key fields
    if (['firstName', 'lastName', 'email', 'phone'].includes(field)) {
      const updatedData = { ...formData, [field]: value };
      const newDuplicates = detectDuplicates(updatedData);
      setDuplicates(newDuplicates);
      
      // Switch to duplicates tab if we found potential matches
      if (newDuplicates.length > 0) {
        setActiveTab('duplicates');
      }
    }
  };

  // Helper to get visible error (only show after first submit attempt)
  const getVisibleError = (field: keyof ExhibitorFormData): string | undefined => {
    return hasSubmitted ? validationErrors[field] : undefined;
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
      // Create new exhibitor
      const newExhibitor: User = {
        id: `exhibitor-${Date.now()}`,
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        streetAddress: formData.streetAddress,
        city: formData.city,
        state: formData.state,
        zipCode: formData.zipCode,
        dogs: []
      };

      // In real app, this would be an API call
      await new Promise(resolve => setTimeout(resolve, 500));

      onExhibitorCreated(newExhibitor);
      handleClose();
    } catch (error) {
      logger.error('Error creating exhibitor:', 'shows', {}, error as Error);
    } finally {
      setIsCreating(false);
    }
  };

  // Handle dialog close
  const handleClose = () => {
    setFormData(INITIAL_FORM_DATA);
    setDuplicates([]);
    setActiveTab('create');
    setValidationErrors({});
    setHasSubmitted(false);
    onOpenChange(false);
  };

  // Handle selecting existing duplicate
  const handleSelectDuplicate = (candidate: DuplicateCandidate) => {
    onDuplicateSelected?.(candidate.person);
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserIcon className="h-5 w-5" />
            Create New Exhibitor
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'create' | 'duplicates')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="create" className="flex items-center gap-2">
              <UserIcon className="h-4 w-4" />
              Create New
            </TabsTrigger>
            <TabsTrigger value="duplicates" className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Possible Duplicates
              {duplicates.length > 0 && (
                <Badge variant="destructive" className="ml-1">
                  {duplicates.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="First Name" fieldId="firstName" required error={getVisibleError('firstName')}>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) => handleFieldChange('firstName', e.target.value)}
                  placeholder="Enter first name"
                  aria-invalid={!!getVisibleError('firstName')}
                  aria-describedby={getVisibleError('firstName') ? 'firstName-error' : undefined}
                />
              </FormField>

              <FormField label="Last Name" fieldId="lastName" required error={getVisibleError('lastName')}>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) => handleFieldChange('lastName', e.target.value)}
                  placeholder="Enter last name"
                  aria-invalid={!!getVisibleError('lastName')}
                  aria-describedby={getVisibleError('lastName') ? 'lastName-error' : undefined}
                />
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Email Address" fieldId="email" required error={getVisibleError('email')}>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleFieldChange('email', e.target.value)}
                  placeholder="Enter email address"
                  aria-invalid={!!getVisibleError('email')}
                  aria-describedby={getVisibleError('email') ? 'email-error' : undefined}
                />
              </FormField>

              <FormField label="Phone Number" fieldId="phone" required error={getVisibleError('phone')}>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => handleFieldChange('phone', e.target.value)}
                  placeholder="Enter phone number"
                  aria-invalid={!!getVisibleError('phone')}
                  aria-describedby={getVisibleError('phone') ? 'phone-error' : undefined}
                />
              </FormField>
            </div>

            <FormField label="Street Address" fieldId="streetAddress">
              <Input
                id="streetAddress"
                value={formData.streetAddress}
                onChange={(e) => handleFieldChange('streetAddress', e.target.value)}
                placeholder="Enter street address"
              />
            </FormField>

            <div className="grid grid-cols-3 gap-4">
              <FormField label="City" fieldId="city">
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => handleFieldChange('city', e.target.value)}
                  placeholder="Enter city"
                />
              </FormField>

              <FormField label="State" fieldId="state">
                <Input
                  id="state"
                  value={formData.state}
                  onChange={(e) => handleFieldChange('state', e.target.value)}
                  placeholder="State"
                />
              </FormField>

              <FormField label="ZIP Code" fieldId="zipCode">
                <Input
                  id="zipCode"
                  value={formData.zipCode}
                  onChange={(e) => handleFieldChange('zipCode', e.target.value)}
                  placeholder="ZIP"
                />
              </FormField>
            </div>

            {duplicates.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  We found {duplicates.length} potential duplicate(s). Please check the "Possible Duplicates" tab 
                  to ensure you're not creating a duplicate exhibitor.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>

          <TabsContent value="duplicates" className="space-y-4">
            {duplicates.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
                <p>No potential duplicates found.</p>
                <p className="text-sm">You can proceed with creating the new exhibitor.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  Found {duplicates.length} potential duplicate(s). Review these carefully:
                </p>
                
                {duplicates.map((candidate) => (
                  <div key={candidate.person.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-semibold">
                            {candidate.person.firstName} {candidate.person.lastName}
                          </h4>
                          <Badge 
                            variant={candidate.matchScore >= 70 ? 'destructive' : 'secondary'}
                          >
                            {candidate.matchScore}% match
                          </Badge>
                        </div>
                        
                        <div className="space-y-1 text-sm text-gray-600">
                          <p>Email: {candidate.person.email}</p>
                          <p>Phone: {candidate.person.phone}</p>
                          {candidate.person.streetAddress && (
                            <p>
                              Address: {candidate.person.streetAddress}, {candidate.person.city}, {candidate.person.state} {candidate.person.zipCode}
                            </p>
                          )}
                        </div>

                        <div className="mt-2">
                          <p className="text-xs text-gray-500 mb-1">Match reasons:</p>
                          <div className="flex flex-wrap gap-1">
                            {candidate.matchReasons.map((reason, reasonIdx) => (
                              <Badge key={reasonIdx} variant="outline" className="text-xs">
                                {reason}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSelectDuplicate(candidate)}
                        className="ml-4"
                      >
                        Use This User
                      </Button>
                    </div>
                  </div>
                ))}

                <Separator />
                
                <div className="text-center">
                  <p className="text-sm text-gray-600 mb-2">
                    None of these match? Continue creating a new exhibitor.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setActiveTab('create')}
                  >
                    Create New Exhibitor Anyway
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isCreating || activeTab === 'duplicates'}
            className="min-w-[100px]"
          >
            {isCreating ? 'Creating...' : 'Create Exhibitor'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};