import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormField } from '@/components/common/FormField';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Info, CheckCircle } from 'lucide-react';
import { Dog, Registration, User } from '@/types/dog-types';
import { logger } from '@/services/LoggingService';
import { useFormValidation } from '@/hooks/useFormValidation';
import { z } from 'zod';

const dogFormSchema = z
  .object({
    registeredName: z.string().min(1, 'Please enter a registered name'),
    callName: z.string().min(1, 'Please enter a call name'),
    breed: z.string().min(1, 'Please select a breed'),
    gender: z.string().min(1, 'Please select a gender'),
    dateOfBirth: z
      .string()
      .min(1, 'Please enter a date of birth')
      .refine(
        val => {
          if (!val) return true;
          const birthDate = new Date(val);
          return birthDate <= new Date();
        },
        { message: 'Date of birth cannot be in the future' }
      )
      .refine(
        val => {
          if (!val) return true;
          const birthDate = new Date(val);
          const now = new Date();
          return birthDate >= new Date(now.getFullYear() - 30, 0, 1);
        },
        { message: 'Date of birth seems too far in the past' }
      ),
    color: z.string(),
    height: z.string().refine(val => !val || !isNaN(Number(val)), {
      message: 'Height must be a number',
    }),
    weight: z.string().refine(val => !val || !isNaN(Number(val)), {
      message: 'Weight must be a number',
    }),
    microchip: z.string(),
    spayedNeutered: z.boolean(),
    hasRegistration: z.boolean(),
    registrationOrg: z.string(),
    registrationNumber: z.string(),
    registrationStatus: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.hasRegistration) {
      if (!data.registrationOrg) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Please select a registration organization',
          path: ['registrationOrg'],
        });
      }
      if (!data.registrationNumber.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Please enter a registration number',
          path: ['registrationNumber'],
        });
      }
    }
  });

type DogFormData = z.input<typeof dogFormSchema>;

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
  registrationStatus: 'Active',
};

interface CreateDogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDogCreated: (dog: Dog) => void;
  ownerId?: string | undefined;
  ownerInfo?: User | undefined;
  prefilledData?: Partial<DogFormData> | undefined;
}

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
  'All American Dog',
];

// Registration organizations
const REGISTRATION_ORGS = [
  'AKC (American Kennel Club)',
  'UKC (United Kennel Club)',
  'CKC (Canadian Kennel Club)',
  'ILP (Indefinite Listing Privilege)',
  'PAL (Purebred Alternative Listing)',
  'Mixed Breed',
  'Other',
];

export const CreateDogDialog: React.FC<CreateDogDialogProps> = ({
  open,
  onOpenChange,
  onDogCreated,
  ownerId,
  ownerInfo,
  prefilledData,
}) => {
  const form = useFormValidation(dogFormSchema, INITIAL_FORM_DATA);
  const [activeTab, setActiveTab] = useState<'basic' | 'registration' | 'optional'>('basic');
  const [isCreating, setIsCreating] = useState(false);

  // Initialize form with prefilled data
  React.useEffect(() => {
    if (prefilledData && open) {
      form.reset({ ...INITIAL_FORM_DATA, ...prefilledData });
    }
  }, [prefilledData, open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle form field changes
  const handleFieldChange = (field: keyof DogFormData, value: string | boolean) => {
    form.setValue(field, value);
    form.touchField(field);

    // Auto-fill call name if registered name is entered and call name is empty
    if (field === 'registeredName' && typeof value === 'string' && !form.data.callName) {
      const suggestedCallName = value.split(' ').pop() || value;
      form.setValue('callName', suggestedCallName);
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
  const doSubmit = form.handleSubmit(async (validatedData: DogFormData) => {
    // Switch to the tab with errors if validation fails (handled by handleSubmit)
    // This code only runs on successful validation

    setIsCreating(true);
    try {
      // Create registration object if needed
      const registrations: Registration[] = [];
      if (validatedData.hasRegistration) {
        registrations.push({
          id: `reg-${Date.now()}`,
          organization: validatedData.registrationOrg,
          registeredName: validatedData.registeredName,
          breed: validatedData.breed,
          registrationNumber: validatedData.registrationNumber,
          status: validatedData.registrationStatus,
          registrationDate: new Date().toISOString().split('T')[0],
        });
      }

      // Calculate age
      const birthDate = new Date(validatedData.dateOfBirth);
      const now = new Date();
      const ageInMonths =
        (now.getFullYear() - birthDate.getFullYear()) * 12 +
        (now.getMonth() - birthDate.getMonth());
      const ageInYears = Math.floor(ageInMonths / 12);

      // Create new dog
      const newDog: Dog = {
        id: `dog-${Date.now()}`,
        name: validatedData.registeredName,
        breed: validatedData.breed,
        sex: validatedData.gender === 'Female' ? 'female' : 'male',
        callName: validatedData.callName,
        gender: validatedData.gender as 'Male' | 'Female',
        age: ageInYears,
        ownerId: ownerId || 'temp-owner-id',
        description: `${validatedData.breed} - ${validatedData.gender}`,
        dateOfBirth: validatedData.dateOfBirth,
        color: validatedData.color,
        height: validatedData.height,
        weight: validatedData.weight,
        microchip: validatedData.microchip,
        spayedNeutered: validatedData.spayedNeutered,
        registrations: registrations.length > 0 ? registrations : undefined,
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
  });

  const handleSubmit = async () => {
    // Before calling the form's submit handler, check which tab has errors
    // and switch to it. We need to do this before handleSubmit because
    // handleSubmit will mark all fields as touched.
    await doSubmit();

    // After submit attempt, if there are errors, switch to the relevant tab
    const errors = form.errors;
    if (Object.keys(errors).length > 0) {
      if (
        errors.registeredName ||
        errors.callName ||
        errors.breed ||
        errors.gender ||
        errors.dateOfBirth
      ) {
        setActiveTab('basic');
      } else if (errors.registrationOrg || errors.registrationNumber) {
        setActiveTab('registration');
      } else if (errors.weight || errors.height) {
        setActiveTab('optional');
      }
    }
  };

  // Handle dialog close
  const handleClose = () => {
    form.reset(INITIAL_FORM_DATA);
    setActiveTab('basic');
    onOpenChange(false);
  };

  // Check if form is valid for current tab using memoized validation
  const tabValidity = useMemo(() => {
    const result = dogFormSchema.safeParse(form.data);
    const errorFields = new Set<string>();
    if (!result.success) {
      result.error.issues.forEach(issue => {
        if (issue.path.length > 0) errorFields.add(issue.path[0] as string);
      });
    }

    const basicFields = ['registeredName', 'callName', 'breed', 'gender', 'dateOfBirth'];
    const regFields = ['registrationOrg', 'registrationNumber'];
    const optFields = ['weight', 'height'];

    return {
      basic: !basicFields.some(f => errorFields.has(f)),
      registration: !form.data.hasRegistration || !regFields.some(f => errorFields.has(f)),
      optional: !optFields.some(f => errorFields.has(f)),
    };
  }, [form.data]);

  // Pre-compute visible errors
  const registeredNameError = form.getError('registeredName');
  const callNameError = form.getError('callName');
  const breedError = form.getError('breed');
  const genderError = form.getError('gender');
  const dateOfBirthError = form.getError('dateOfBirth');
  const registrationOrgError = form.getError('registrationOrg');
  const registrationNumberError = form.getError('registrationNumber');
  const heightError = form.getError('height');
  const weightError = form.getError('weight');

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

        <Tabs
          value={activeTab}
          onValueChange={value => setActiveTab(value as 'basic' | 'registration' | 'optional')}
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger
              value="basic"
              className={`flex items-center gap-2 ${!tabValidity.basic ? 'text-red-600' : ''}`}
            >
              Basic Info *{tabValidity.basic && <CheckCircle className="h-4 w-4 text-green-600" />}
            </TabsTrigger>
            <TabsTrigger
              value="registration"
              className={`flex items-center gap-2 ${!tabValidity.registration ? 'text-red-600' : ''}`}
            >
              Registration
              {tabValidity.registration && <CheckCircle className="h-4 w-4 text-green-600" />}
            </TabsTrigger>
            <TabsTrigger
              value="optional"
              className={`flex items-center gap-2 ${!tabValidity.optional ? 'text-red-600' : ''}`}
            >
              Additional Info
              {tabValidity.optional && <CheckCircle className="h-4 w-4 text-green-600" />}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                label="Registered Name"
                fieldId="registeredName"
                required
                error={registeredNameError}
              >
                <Input
                  id="registeredName"
                  value={form.data.registeredName}
                  onChange={e => handleFieldChange('registeredName', e.target.value)}
                  placeholder="Full registered name"
                  {...form.getFieldProps('registeredName')}
                />
              </FormField>

              <FormField label="Call Name" fieldId="callName" required error={callNameError}>
                <Input
                  id="callName"
                  value={form.data.callName}
                  onChange={e => handleFieldChange('callName', e.target.value)}
                  placeholder="Everyday name"
                  {...form.getFieldProps('callName')}
                />
              </FormField>
            </div>

            <FormField label="Breed" fieldId="breed" required error={breedError}>
              <Select
                value={form.data.breed}
                onValueChange={value => handleFieldChange('breed', value)}
              >
                <SelectTrigger aria-invalid={!!breedError}>
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
              <FormField label="Gender" fieldId="gender" required error={genderError}>
                <Select
                  value={form.data.gender}
                  onValueChange={value => handleFieldChange('gender', value)}
                >
                  <SelectTrigger aria-invalid={!!genderError}>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>

              <FormField
                label="Date of Birth"
                fieldId="dateOfBirth"
                required
                error={dateOfBirthError}
                hint={
                  form.data.dateOfBirth ? `Age: ${calculateAge(form.data.dateOfBirth)}` : undefined
                }
              >
                <Input
                  id="dateOfBirth"
                  type="date"
                  value={form.data.dateOfBirth}
                  onChange={e => handleFieldChange('dateOfBirth', e.target.value)}
                  {...form.getFieldProps('dateOfBirth')}
                />
              </FormField>
            </div>

            <FormField label="Color/Markings" fieldId="color">
              <Input
                id="color"
                value={form.data.color}
                onChange={e => handleFieldChange('color', e.target.value)}
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
                    checked={form.data.hasRegistration}
                    onCheckedChange={checked =>
                      handleFieldChange('hasRegistration', checked === true)
                    }
                  />
                  <Label htmlFor="hasRegistration">This dog has a formal registration</Label>
                </div>

                {form.data.hasRegistration && (
                  <>
                    <FormField
                      label="Registration Organization"
                      fieldId="registrationOrg"
                      required
                      error={registrationOrgError}
                    >
                      <Select
                        value={form.data.registrationOrg}
                        onValueChange={value => handleFieldChange('registrationOrg', value)}
                      >
                        <SelectTrigger aria-invalid={!!registrationOrgError}>
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
                      <FormField
                        label="Registration Number"
                        fieldId="registrationNumber"
                        required
                        error={registrationNumberError}
                      >
                        <Input
                          id="registrationNumber"
                          value={form.data.registrationNumber}
                          onChange={e => handleFieldChange('registrationNumber', e.target.value)}
                          placeholder="Enter registration number"
                          {...form.getFieldProps('registrationNumber')}
                        />
                      </FormField>

                      <FormField label="Status" fieldId="registrationStatus">
                        <Select
                          value={form.data.registrationStatus}
                          onValueChange={value => handleFieldChange('registrationStatus', value)}
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

                {!form.data.hasRegistration && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      No registration information will be stored. This is fine for mixed breeds or
                      dogs without formal registration papers.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="optional" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Height (inches)" fieldId="height" error={heightError}>
                <Input
                  id="height"
                  value={form.data.height}
                  onChange={e => handleFieldChange('height', e.target.value)}
                  placeholder="e.g., 24"
                  type="number"
                  step="0.1"
                  {...form.getFieldProps('height')}
                />
              </FormField>

              <FormField label="Weight (pounds)" fieldId="weight" error={weightError}>
                <Input
                  id="weight"
                  value={form.data.weight}
                  onChange={e => handleFieldChange('weight', e.target.value)}
                  placeholder="e.g., 55"
                  type="number"
                  step="0.1"
                  {...form.getFieldProps('weight')}
                />
              </FormField>
            </div>

            <FormField label="Microchip Number" fieldId="microchip">
              <Input
                id="microchip"
                value={form.data.microchip}
                onChange={e => handleFieldChange('microchip', e.target.value)}
                placeholder="15-digit microchip number"
              />
            </FormField>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="spayedNeutered"
                checked={form.data.spayedNeutered}
                onCheckedChange={checked => handleFieldChange('spayedNeutered', checked === true)}
              />
              <Label htmlFor="spayedNeutered">Spayed/Neutered</Label>
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
                disabled={!tabValidity[activeTab]}
              >
                Next
              </Button>
            )}
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isCreating} className="min-w-[100px]">
              {isCreating ? 'Creating...' : 'Create Dog'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
