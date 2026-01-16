import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { EditPanelWrapper } from './EditPanelWrapper';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { logger } from '@/services/LoggingService';
import {
  Heart, 
  User, 
  FileText, 
  Settings, 
  AlertCircle, 
  CheckCircle, 
  PlusCircle,
  Edit,
  Trash2,
  Camera 
} from 'lucide-react';
import PhotoDialog from '@/components/common/PhotoDialog';
import { AddEditRegistrationDialog } from '@/components/dogs/AddEditRegistrationDialog';
import { useUserStore } from '@/store/userStore';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { DogInput } from '@/store/dogStore';
import type { Dog as DogType, Registration } from '@/types/dog-types';
import { UserRole } from '@/types/auth-types';
import { cn } from '@/lib/utils';

interface AddDogPanelProps {
  open: boolean;
  onClose: () => void;
  onDogCreated: (dog: DogType) => void;
  userRole?: UserRole;
  currentUserPersonId?: string;
}

// Form data interface
interface DogFormData extends Record<string, unknown> {
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
  imageUrl?: string;
  
  // Owner Information
  ownerId: string;
  
  // Registration Information
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
  imageUrl: '',
  ownerId: '',
  registrations: []
};

// Form validation
const validateDogData = (data: DogFormData): Record<string, string> => {
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

  // Registration validation
  data.registrations.forEach((reg, index) => {
    if (!reg.organization.trim()) errors[`registration-${index}-organization`] = 'Organization is required';
    if (!reg.registeredName.trim()) errors[`registration-${index}-registeredName`] = 'Registered name is required';
    if (!reg.breed.trim()) errors[`registration-${index}-breed`] = 'Breed is required';
    if (!reg.registrationNumber.trim()) errors[`registration-${index}-registrationNumber`] = 'Registration number is required';
  });

  return errors;
};

export const AddDogPanel: React.FC<AddDogPanelProps> = ({
  open,
  onClose,
  onDogCreated,
  userRole = UserRole.EXHIBITOR,
  currentUserPersonId
}) => {
  const people = useUserStore(state => state.people);
  const { addDog, isLoading: isSaving, error: saveError } = useDogStoreCompat();
  
  const [formData, setFormData] = useState<DogFormData>(INITIAL_FORM_DATA);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'basic' | 'registration' | 'optional'>('basic');
  const [isCreating, setIsCreating] = useState(false);

  // Photo dialog state
  const [isPhotoDialogOpen, setIsPhotoDialogOpen] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isPhotoDragging, setIsPhotoDragging] = useState(false);

  // Registration dialog state
  const [isAddEditRegDialogOpen, setIsAddEditRegDialogOpen] = useState(false);
  const [currentRegToEdit, setCurrentRegToEdit] = useState<Registration | undefined>(undefined);

  // Initialize owner ID based on role
  useEffect(() => {
    if (userRole === UserRole.EXHIBITOR && currentUserPersonId && !formData.ownerId) {
      setFormData(prev => ({ ...prev, ownerId: currentUserPersonId }));
    }
  }, [userRole, currentUserPersonId, formData.ownerId]);

  // Reset form when panel opens
  useEffect(() => {
    if (open) {
      const initialData = { 
        ...INITIAL_FORM_DATA,
        ownerId: userRole === UserRole.EXHIBITOR ? (currentUserPersonId || '') : ''
      };
      setFormData(initialData);
      setActiveTab('basic');
      setValidationErrors({});
      setIsCreating(false);
    }
  }, [open, userRole, currentUserPersonId]);

  // Handle form field changes
  const handleFieldChange = useCallback((field: keyof DogFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear validation error for this field
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  }, [validationErrors]);

  // Handle adding/editing a registration
  const handleSaveRegistration = useCallback((newReg: Registration) => {
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
  }, []);

  // Handle removing a registration
  const handleRemoveRegistration = useCallback((id: string) => {
    setFormData(prev => ({
      ...prev,
      registrations: prev.registrations.filter(reg => reg.id !== id)
    }));
  }, []);

  // Calculate age from date of birth
  const calculateAge = useCallback((dateOfBirth: string): string => {
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
  }, []);

  // Photo handling
  const handlePhotoDialogOpen = (open: boolean) => {
    setIsPhotoDialogOpen(open);
    if (!open) setPhotoPreview(null);
  };

  const handlePhotoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsPhotoDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handlePhotoFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handlePhotoSave = (preview: string | null) => {
    if (preview) {
      setFormData(prev => ({ ...prev, imageUrl: preview }));
    }
    setIsPhotoDialogOpen(false);
    setPhotoPreview(null);
  };


  const isTabValid = useCallback((tab: string): boolean => {
    const errors = validateDogData(formData);
    switch (tab) {
      case 'basic':
        return !errors.callName && !errors.gender && !errors.dateOfBirth && !errors.ownerId;
      case 'registration':
        if (formData.registrations.length === 0) return true;
        return formData.registrations.every((_, index) => 
          !errors[`registration-${index}-organization`] &&
          !errors[`registration-${index}-registeredName`] &&
          !errors[`registration-${index}-breed`] &&
          !errors[`registration-${index}-registrationNumber`]
        );
      case 'optional':
        return true;
      default:
        return true;
    }
  }, [formData]);

  // Handle form submission
  const handleSave = async () => {
    const errors = validateDogData(formData);
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
      onClose();
      
      // Reset form
      setFormData(INITIAL_FORM_DATA);
      setValidationErrors({});
    } catch (error) {
      logger.error('Error creating dog:', 'components', {}, error as Error);
      setValidationErrors({ 
        submit: error instanceof Error ? error.message : 'Failed to create dog' 
      });
    } finally {
      setIsCreating(false);
    }
  };

  // Panel title and subtitle
  const panelTitle = "Add New Dog";
  const panelSubtitle = useMemo(() => {
    const validBasic = isTabValid('basic');
    const validReg = isTabValid('registration');
    const validOptional = isTabValid('optional');
    
    const completedTabs = [validBasic, validReg, validOptional].filter(Boolean).length;
    
    return `Step ${completedTabs + 1} of 3 • ${Math.round((completedTabs / 3) * 100)}% complete`;
  }, [isTabValid]);

  return (
    <EditPanelWrapper
      open={open}
      onClose={onClose}
      title={panelTitle}
      subtitle={panelSubtitle}
      initialData={formData}
      onSave={async () => await handleSave()}
      validateData={(data) => {
        // Only validate essential fields for panel save button
        const formData = data as DogFormData;
        const hasRequiredFields = formData.callName?.trim() && 
                                 formData.gender && 
                                 formData.dateOfBirth && 
                                 formData.ownerId;
        
        if (!hasRequiredFields) {
          const missingFields: string[] = [];
          if (!formData.callName?.trim()) missingFields.push('Call name');
          if (!formData.gender) missingFields.push('Gender');
          if (!formData.dateOfBirth) missingFields.push('Date of birth');
          if (!formData.ownerId) missingFields.push('Owner');
          return [`Missing required fields: ${missingFields.join(', ')}`];
        }
        
        // Check for date validation errors
        if (formData.dateOfBirth) {
          const birthDate = new Date(formData.dateOfBirth);
          const now = new Date();
          if (birthDate > now) {
            return ['Date of birth cannot be in the future'];
          }
          if (birthDate < new Date(now.getFullYear() - 30, 0, 1)) {
            return ['Date of birth seems too far in the past'];
          }
        }
        
        return null; // Form is valid
      }}
      size="xl"
      saveLabel={isCreating || isSaving ? 'Creating...' : 'Create Dog'}
      enableAutoSave={false}
      showUnsavedWarning={true}
    >
      <div className="space-y-8">
        {/* Error Display */}
        {(saveError || validationErrors.submit) && (
          <Alert className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
            <AlertDescription className="text-red-800 dark:text-red-300">
              {saveError || validationErrors.submit}
            </AlertDescription>
          </Alert>
        )}

        {/* Progress Tabs - Apple-inspired design */}
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'basic' | 'registration' | 'optional')}>
          <TabsList className="grid w-full grid-cols-3 bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1 backdrop-blur-xl">
            <TabsTrigger 
              value="basic" 
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg transition-all duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]",
                "data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5",
                "data-[state=active]:text-primary data-[state=active]:shadow-sm data-[state=active]:scale-[1.02]",
                "hover:bg-muted/20 hover:scale-[1.01] active:scale-[0.98]",
                !isTabValid('basic') && "text-destructive/80 data-[state=active]:text-destructive"
              )}
            >
              <Heart className="h-4 w-4" />
              <span className="font-medium">Essential</span>
              {isTabValid('basic') && <CheckCircle className="h-4 w-4 text-emerald-500 animate-in zoom-in-0 duration-200" />}
            </TabsTrigger>
            <TabsTrigger 
              value="registration"
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg transition-all duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]",
                "data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5",
                "data-[state=active]:text-primary data-[state=active]:shadow-sm data-[state=active]:scale-[1.02]",
                "hover:bg-muted/20 hover:scale-[1.01] active:scale-[0.98]",
                !isTabValid('registration') && "text-destructive/80 data-[state=active]:text-destructive"
              )}
            >
              <FileText className="h-4 w-4" />
              <span className="font-medium">Registration</span>
              {isTabValid('registration') && <CheckCircle className="h-4 w-4 text-emerald-500 animate-in zoom-in-0 duration-200" />}
            </TabsTrigger>
            <TabsTrigger 
              value="optional"
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg transition-all duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]",
                "data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5",
                "data-[state=active]:text-primary data-[state=active]:shadow-sm data-[state=active]:scale-[1.02]",
                "hover:bg-muted/20 hover:scale-[1.01] active:scale-[0.98]",
                !isTabValid('optional') && "text-destructive/80 data-[state=active]:text-destructive"
              )}
            >
              <Settings className="h-4 w-4" />
              <span className="font-medium">Additional</span>
              {isTabValid('optional') && <CheckCircle className="h-4 w-4 text-emerald-500 animate-in zoom-in-0 duration-200" />}
            </TabsTrigger>
          </TabsList>

          {/* Basic Info Tab - Enhanced Apple design */}
          <TabsContent value="basic" className="space-y-8 mt-8 animate-in slide-in-from-bottom-2 duration-500 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]">
            <Card className="group relative overflow-hidden bg-gradient-to-br from-card/95 to-card/80 border border-border/30 rounded-2xl backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/3 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <CardHeader className="relative">
                <CardTitle className="flex items-center gap-3 text-lg font-semibold tracking-tight">
                  <div className="p-2 bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl">
                    <Heart className="h-5 w-5 text-primary" />
                  </div>
                  <span className="bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                    Essential Information
                  </span>
                </CardTitle>
                <p className="text-sm text-muted-foreground/80 mt-1 leading-relaxed">
                  Basic details to get started with your dog's profile
                </p>
              </CardHeader>
              <CardContent className="space-y-8 relative">
                {/* Photo Section - Enhanced with glass morphism */}
                <div className="flex items-start gap-6 p-6 bg-gradient-to-r from-muted/20 via-muted/10 to-transparent border border-border/20 rounded-2xl backdrop-blur-sm">
                  <button 
                    type="button"
                    onClick={() => handlePhotoDialogOpen(true)}
                    className="relative group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-all duration-300 hover:scale-105 active:scale-95"
                  >
                    <Avatar className="w-24 h-24 border-2 border-border/30 group-hover:border-primary/50 transition-all duration-500 shadow-lg group-hover:shadow-xl group-hover:shadow-primary/10">
                      {formData.imageUrl ? (
                        <AvatarImage src={formData.imageUrl} alt="Dog photo" className="object-cover" />
                      ) : (
                        <AvatarFallback className="bg-gradient-to-br from-primary/15 to-primary/8 text-2xl font-semibold text-primary">
                          {formData.callName ? formData.callName[0].toUpperCase() : '🐕'}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-black/0 via-black/0 to-black/0 group-hover:from-black/20 group-hover:via-black/30 group-hover:to-black/20 transition-all duration-500 rounded-full backdrop-blur-sm">
                      <div className="p-3 bg-white/95 dark:bg-gray-900/95 rounded-full opacity-0 group-hover:opacity-100 transform scale-50 group-hover:scale-100 transition-all duration-500 shadow-lg backdrop-blur-sm">
                        <Camera className="w-5 h-5 text-primary" />
                      </div>
                    </div>
                    <div className="absolute -bottom-2 -right-2 w-6 h-6 bg-gradient-to-r from-primary to-secondary rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 shadow-lg">
                      <Edit className="w-3 h-3 text-white" />
                    </div>
                  </button>
                  <div className="flex-1 space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="callName" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                        Call Name *
                      </Label>
                      <Input
                        id="callName"
                        value={formData.callName}
                        onChange={(e) => handleFieldChange('callName', e.target.value)}
                        placeholder="Everyday name your dog goes by"
                        className={cn(
                          "border-0 bg-input rounded-xl px-3.5 py-3 text-base font-medium tracking-tight transition-all duration-200",
                          "focus:bg-background focus:ring-2 focus:ring-primary/20 focus:ring-offset-1",
                          "placeholder:text-muted-foreground/60",
                          validationErrors.callName && "ring-2 ring-destructive/50 bg-destructive/5"
                        )}
                      />
                      {validationErrors.callName && (
                        <p className="text-xs text-destructive mt-2 flex items-center gap-1 animate-in slide-in-from-top-1 duration-200">
                          <AlertCircle className="h-3 w-3" />
                          {validationErrors.callName}
                        </p>
                      )}
                    </div>
                    {formData.callName && (
                      <div className="text-xs text-muted-foreground/70 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
                        ✨ Looking great! This will be your dog's primary name.
                      </div>
                    )}
                  </div>
                </div>

                {/* Enhanced Form Grid with Apple-style inputs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="gender" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                      Gender *
                    </Label>
                    <Select value={formData.gender} onValueChange={(value) => handleFieldChange('gender', value)}>
                      <SelectTrigger className={cn(
                        "border-0 bg-input rounded-xl px-3.5 py-3 text-base font-medium transition-all duration-200",
                        "focus:bg-background focus:ring-2 focus:ring-primary/20 focus:ring-offset-1",
                        validationErrors.gender && "ring-2 ring-destructive/50 bg-destructive/5"
                      )}>
                        <SelectValue placeholder="Choose gender" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover/95 backdrop-blur-xl border border-border/30 rounded-xl shadow-2xl">
                        <SelectItem value="Male" className="rounded-lg transition-colors">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                            <span>Male ♂</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="Female" className="rounded-lg transition-colors">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-pink-500"></div>
                            <span>Female ♀</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {validationErrors.gender && (
                      <p className="text-xs text-destructive mt-2 flex items-center gap-1 animate-in slide-in-from-top-1 duration-200">
                        <AlertCircle className="h-3 w-3" />
                        {validationErrors.gender}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dateOfBirth" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                      Date of Birth *
                    </Label>
                    <Input
                      id="dateOfBirth"
                      type="date"
                      value={formData.dateOfBirth}
                      onChange={(e) => handleFieldChange('dateOfBirth', e.target.value)}
                      className={cn(
                        "border-0 bg-input rounded-xl px-3.5 py-3 text-base font-medium transition-all duration-200",
                        "focus:bg-background focus:ring-2 focus:ring-primary/20 focus:ring-offset-1",
                        validationErrors.dateOfBirth && "ring-2 ring-destructive/50 bg-destructive/5"
                      )}
                    />
                    {formData.dateOfBirth && !validationErrors.dateOfBirth && (
                      <div className="text-xs text-muted-foreground/70 bg-muted/30 px-3 py-2 rounded-lg animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
                        🎂 Age: {calculateAge(formData.dateOfBirth)}
                      </div>
                    )}
                    {validationErrors.dateOfBirth && (
                      <p className="text-xs text-destructive mt-2 flex items-center gap-1 animate-in slide-in-from-top-1 duration-200">
                        <AlertCircle className="h-3 w-3" />
                        {validationErrors.dateOfBirth}
                      </p>
                    )}
                  </div>

                  <div className="md:col-span-2 space-y-2">
                    <Label htmlFor="color" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                      Color & Markings
                    </Label>
                    <Input
                      id="color"
                      value={formData.color}
                      onChange={(e) => handleFieldChange('color', e.target.value)}
                      placeholder="e.g., Black & White, Red, Blue Merle"
                      className="border-0 bg-input rounded-xl px-3.5 py-3 text-base font-medium tracking-tight transition-all duration-200 focus:bg-background focus:ring-2 focus:ring-primary/20 focus:ring-offset-1 placeholder:text-muted-foreground/60"
                    />
                    <div className="text-xs text-muted-foreground/60">
                      Describe the primary color and any distinctive markings
                    </div>
                  </div>
                </div>

                <div className="my-8" style={{ borderBottom: '0.5px solid rgba(128, 128, 128, 0.2)' }}></div>

                {/* Enhanced Owner Selection */}
                {(userRole === UserRole.SECRETARY || userRole === UserRole.CLUB_ADMIN || userRole === UserRole.SITE_ADMIN) && (
                  <div className="space-y-2">
                    <Label htmlFor="owner" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                      Owner *
                    </Label>
                    <Select value={formData.ownerId} onValueChange={(value) => handleFieldChange('ownerId', value)}>
                      <SelectTrigger className={cn(
                        "border-0 bg-input rounded-xl px-3.5 py-3 text-base font-medium transition-all duration-200",
                        "focus:bg-background focus:ring-2 focus:ring-primary/20 focus:ring-offset-1",
                        validationErrors.ownerId && "ring-2 ring-destructive/50 bg-destructive/5"
                      )}>
                        <SelectValue placeholder="Choose dog owner" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover/95 backdrop-blur-xl border border-border/30 rounded-xl shadow-2xl max-h-60">
                        {people.map((person) => (
                          <SelectItem key={person.id} value={person.id} className="rounded-lg transition-colors">
                            <div className="flex items-center gap-3 py-1">
                              <div className="p-1.5 bg-primary/10 rounded-lg">
                                <User className="h-3.5 w-3.5 text-primary" />
                              </div>
                              <div className="flex-1">
                                <div className="font-medium">{person.firstName} {person.lastName}</div>
                                {person.email && (
                                  <div className="text-xs text-muted-foreground/70">{person.email}</div>
                                )}
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {validationErrors.ownerId && (
                      <p className="text-xs text-destructive mt-2 flex items-center gap-1 animate-in slide-in-from-top-1 duration-200">
                        <AlertCircle className="h-3 w-3" />
                        {validationErrors.ownerId}
                      </p>
                    )}
                  </div>
                )}

                {/* Enhanced Owner Display for Exhibitor */}
                {userRole === UserRole.EXHIBITOR && currentUserPersonId && (
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                      Owner
                    </Label>
                    <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-muted/30 to-muted/10 border border-border/20 rounded-xl backdrop-blur-sm">
                      <div className="p-2 bg-primary/10 rounded-xl">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-foreground">
                          {(() => {
                            const currentPerson = people.find(p => p.id === currentUserPersonId);
                            return currentPerson ? `${currentPerson.firstName} ${currentPerson.lastName}` : 'You';
                          })()}
                        </div>
                        <div className="text-xs text-muted-foreground/70 mt-0.5">
                          This dog will be registered to your account
                        </div>
                      </div>
                      <div className="px-2 py-1 bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-xs font-medium rounded-lg">
                        You
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Registration Tab */}
          <TabsContent value="registration" className="space-y-8 mt-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  Registration Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {formData.registrations.length === 0 ? (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      No registrations added yet. Click "Add New Registration" to add one.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-4">
                    {formData.registrations.map((reg, index) => (
                      <Card key={reg.id || index} className="border-2">
                        <CardContent className="pt-6">
                          <div className="flex items-start justify-between">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <Badge className="bg-primary/10 text-primary border-primary/20">
                                  {reg.organization}
                                </Badge>
                                <Badge variant="outline" className={
                                  reg.status === 'active' ? 'border-green-500 text-green-700' : 'border-gray-500 text-gray-700'
                                }>
                                  {reg.status}
                                </Badge>
                              </div>
                              <h4 className="font-medium text-foreground">{reg.registeredName}</h4>
                              <div className="text-sm text-muted-foreground space-y-1">
                                <p>Breed: {reg.breed}</p>
                                <p>Number: {reg.registrationNumber}</p>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button 
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setCurrentRegToEdit(reg);
                                  setIsAddEditRegDialogOpen(true);
                                }}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveRegistration(reg.id)}
                                className="text-red-600 hover:text-red-800"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                <Button 
                  variant="outline"
                  className="w-full border-dashed border-2 h-12 hover:border-primary/50 hover:text-primary"
                  onClick={() => {
                    setCurrentRegToEdit(undefined);
                    setIsAddEditRegDialogOpen(true);
                  }}
                >
                  <PlusCircle className="h-4 w-4 mr-2" />
                  Add New Registration
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Optional Tab */}
          <TabsContent value="optional" className="space-y-8 mt-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5 text-primary" />
                  Additional Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label htmlFor="height" className="text-sm font-medium">Height (inches)</Label>
                    <Input
                      id="height"
                      value={formData.height}
                      onChange={(e) => handleFieldChange('height', e.target.value)}
                      placeholder="e.g., 24"
                      type="number"
                      step="0.1"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="weight" className="text-sm font-medium">Weight (pounds)</Label>
                    <Input
                      id="weight"
                      value={formData.weight}
                      onChange={(e) => handleFieldChange('weight', e.target.value)}
                      placeholder="e.g., 55"
                      type="number"
                      step="0.1"
                      className="mt-1"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Label htmlFor="microchip" className="text-sm font-medium">Microchip Number</Label>
                    <Input
                      id="microchip"
                      value={formData.microchip}
                      onChange={(e) => handleFieldChange('microchip', e.target.value)}
                      placeholder="15-digit microchip number"
                      className="mt-1"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="spayedNeutered"
                    checked={formData.spayedNeutered}
                    onCheckedChange={(checked) => handleFieldChange('spayedNeutered', checked === true)}
                  />
                  <Label htmlFor="spayedNeutered" className="text-sm font-medium cursor-pointer">
                    Spayed/Neutered
                  </Label>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>


      {/* Photo Dialog */}
      <PhotoDialog
        open={isPhotoDialogOpen}
        onOpenChange={handlePhotoDialogOpen}
        previewImage={photoPreview}
        currentPhoto={formData.imageUrl || ''}
        isDragging={isPhotoDragging}
        onDrop={handlePhotoDrop}
        onDragOver={(e) => { e.preventDefault(); setIsPhotoDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsPhotoDragging(false); }}
        onFileInput={handlePhotoFileInput}
        onCancel={() => setIsPhotoDialogOpen(false)}
        onSave={handlePhotoSave}
        title="Add Dog Photo"
        previewAlt="Dog photo preview"
      />

      {/* Registration Dialog */}
      <AddEditRegistrationDialog
        open={isAddEditRegDialogOpen}
        onOpenChange={setIsAddEditRegDialogOpen}
        onSave={handleSaveRegistration}
        initialData={currentRegToEdit}
      />
    </EditPanelWrapper>
  );
};