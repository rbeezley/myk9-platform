import React, { useState, useCallback, useMemo, createContext, useContext } from 'react';
import { EditPanelWrapper } from './EditPanelWrapper';
import { useEditPanel } from './useEditPanel';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dog, FileText, Camera, Heart } from 'lucide-react';
import PhotoDialog from '@/components/common/PhotoDialog';
import type { Dog as DogType, Registration } from '@/types/dog-types';
import type { User as PersonType } from '@/types/user-types';
import { UserRole } from '@/types/auth-types';
import { cn } from '@/lib/utils';

// Context for passing admin-specific props to the form
interface DogEditContextType {
  isAdmin: boolean;
  people: PersonType[];
}
const DogEditContext = createContext<DogEditContextType>({ isAdmin: false, people: [] });

interface DogEditPanelProps {
  open: boolean;
  onClose: () => void;
  dogId: string;
  dogName: string;
  initialDogData: Partial<DogType>;
  onSave?: (dogData: Partial<DogType>) => Promise<void>;
  enableAutoSave?: boolean;
  showAdvancedFields?: boolean;
  /** User role - admins can change dog ownership */
  userRole?: UserRole;
  /** People list for owner selection (required for admins) */
  people?: PersonType[];
}

// Form data interface matching DogProfileEditDialog expectations
interface DogFormData extends Record<string, unknown> {
  callName: string;
  registeredName: string;
  gender: string;
  dateOfBirth: string;
  color: string;
  weight: string;
  height: string;
  microchip: string;
  imageUrl?: string;
  ownerId: string;
  registrations: Registration[];
  healthRecords: DogType['healthRecords'];
  // Optional advanced fields
  notes?: string;
  specialNeeds?: string;
}

// Form validation
const validateDogData = (data: DogFormData): string[] | null => {
  const errors: string[] = [];

  if (!data.callName?.trim()) {
    errors.push('Call name is required');
  }

  if (!data.registeredName?.trim()) {
    errors.push('Registered name is required');
  }

  if (!data.gender) {
    errors.push('Gender is required');
  }

  if (!data.dateOfBirth) {
    errors.push('Date of birth is required');
  }

  // Note: ownerId is not validated here - it's set during dog creation
  // and preserved during editing. Owner changes should be handled separately.

  // Validate registrations if present
  data.registrations?.forEach((reg, index) => {
    if (!reg.organization) {
      errors.push(`Registration ${index + 1}: Organization is required`);
    }
    if (!reg.registrationNumber?.trim()) {
      errors.push(`Registration ${index + 1}: Registration number is required`);
    }
  });

  return errors.length > 0 ? errors : null;
};

// Convert DogType to form data
const dogToFormData = (dog: Partial<DogType>): DogFormData => {
  // Get registered name from first registration if available, fall back to dog name
  const registeredName = dog.registrations?.[0]?.registeredName || dog.name || '';

  // Derive gender from sex if not set (use lowercase to match Select values)
  const gender = dog.gender?.toLowerCase() ||
    (dog.sex === 'male' ? 'male' : dog.sex === 'female' ? 'female' : '');

  return {
    callName: dog.callName || dog.name || '',
    registeredName,
    gender,
    dateOfBirth: dog.dateOfBirth || dog.birthDate || '',
    color: dog.color || '',
    weight: dog.weight || (dog.measurements?.weight?.toString()) || '',
    height: dog.height || (dog.measurements?.height?.toString()) || '',
    microchip: dog.microchip || dog.microchipNumber || '',
    imageUrl: dog.imageUrl || '',
    ownerId: dog.ownerId || '',
    registrations: (dog.registrations as Registration[]) || [],
    healthRecords: dog.healthRecords || {},
    notes: (dog as Record<string, unknown>).notes as string || '',
    specialNeeds: (dog as Record<string, unknown>).specialNeeds as string || '',
  };
};

// Convert form data back to DogType
const formDataToDog = (formData: DogFormData): Partial<DogType> => {
  // Update or create registrations with the registered name
  let registrations = formData.registrations || [];

  if (formData.registeredName) {
    if (registrations.length > 0) {
      // Update the first registration's registeredName with the form field value
      registrations = registrations.map((reg, index) =>
        index === 0 ? { ...reg, registeredName: formData.registeredName } : reg
      );
    } else {
      // Create a new registration if none exist but user entered a registered name
      // Use a temporary ID - the database will generate the real one on save
      registrations = [{
        id: `temp-${Date.now()}`,
        organization: 'AKC', // Default organization
        registeredName: formData.registeredName,
        registrationNumber: '',
        breed: '',
        status: 'pending',
      }];
    }
  }

  return {
    callName: formData.callName,
    name: formData.callName, // Keep both for compatibility
    gender: formData.gender as 'Male' | 'Female' | '',
    ...(formData.gender ? { sex: formData.gender.toLowerCase() as 'male' | 'female' } : {}),
    dateOfBirth: formData.dateOfBirth,
    birthDate: formData.dateOfBirth, // Keep both for compatibility
    color: formData.color,
    weight: formData.weight,
    height: formData.height,
    measurements: {
      weight: formData.weight ? parseFloat(formData.weight) : undefined,
      height: formData.height ? parseFloat(formData.height) : undefined,
    },
    microchip: formData.microchip,
    microchipNumber: formData.microchip, // Keep both for compatibility
    imageUrl: formData.imageUrl,
    ownerId: formData.ownerId,
    registrations,
    healthRecords: formData.healthRecords,
    ...(formData.notes && ({ notes: formData.notes } as Record<string, unknown>)),
    ...(formData.specialNeeds && ({ specialNeeds: formData.specialNeeds } as Record<string, unknown>)),
  };
};

// Owner selection field - only rendered for admins
const OwnerSelectionField: React.FC = () => {
  const { isAdmin, people } = useContext(DogEditContext);
  const { data, updateData } = useEditPanel<DogFormData>();

  // Don't render if not admin
  if (!isAdmin) return null;

  const currentOwner = people.find(p => p.id === data.ownerId);

  // Compute display text for the trigger
  const displayText = currentOwner
    ? `${currentOwner.firstName} ${currentOwner.lastName}`
    : data.ownerId
      ? 'Unknown Owner'
      : 'Select owner';

  // If no people available, show a message
  if (people.length === 0) {
    return (
      <div className="space-y-2 pt-4 border-t border-border/30">
        <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
          Owner
        </Label>
        <div className="text-sm text-muted-foreground py-2">
          {displayText}
        </div>
        <p className="text-xs text-muted-foreground/60">
          No people available to assign as owner
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 pt-4 border-t border-border/30">
      <Label htmlFor="ownerId" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
        Owner ({people.length} available)
      </Label>
      <select
        id="ownerId"
        value={data.ownerId || ''}
        onChange={(e) => updateData({ ownerId: e.target.value })}
        className="w-full border-0 bg-input rounded-xl px-3.5 py-3 text-base font-medium transition-all duration-200 focus:bg-background focus:ring-2 focus:ring-primary/20 focus:ring-offset-1 focus:outline-none"
      >
        <option value="" disabled>Select owner</option>
        {data.ownerId && !currentOwner && (
          <option value={data.ownerId}>Unknown Owner (ID: {data.ownerId.slice(0, 8)}...)</option>
        )}
        {people.map((person) => (
          <option key={person.id} value={person.id}>
            {person.firstName} {person.lastName}{person.email ? ` (${person.email})` : ''}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground/60">
        Change the owner of this dog (admin only)
      </p>
    </div>
  );
};

// Form content component
const DogEditForm: React.FC = () => {
  const { data, updateData, errors } = useEditPanel<DogFormData>();
  
  // Photo dialog state
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Handle input changes
  const handleInputChange = useCallback((field: keyof DogFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    updateData({ [field]: e.target.value });
  }, [updateData]);

  // Handle select changes
  const handleSelectChange = useCallback((field: keyof DogFormData) => (value: string) => {
    updateData({ [field]: value });
  }, [updateData]);

  // Handle file upload (shared logic for drag & drop and file input)
  const handleFileUpload = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setPreviewImage(result);
    };
    reader.readAsDataURL(file);
  }, []);

  // Drag & drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);
  
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  }, [handleFileUpload]);

  // File input handler
  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  }, [handleFileUpload]);

  const handlePhotoSave = useCallback((preview: string | null) => {
    if (preview) {
      updateData({ imageUrl: preview });
    }
    setIsPhotoModalOpen(false);
    setPreviewImage(null);
  }, [updateData]);
  
  return (
    <div className="space-y-6 p-6">
      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1 transition-all duration-300 ease-out">
          <TabsTrigger 
            value="basic" 
            className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            <Dog className="h-4 w-4" />
            Basic Info
          </TabsTrigger>
          <TabsTrigger 
            value="registrations" 
            className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            <FileText className="h-4 w-4" />
            Registrations
          </TabsTrigger>
          <TabsTrigger 
            value="health" 
            className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            <Heart className="h-4 w-4" />
            Health
          </TabsTrigger>
        </TabsList>

        {/* Basic Information Tab */}
        <TabsContent value="basic" className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out">
          <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Dog className="h-5 w-5" />
                Dog Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Profile Image Section */}
              <div className="flex items-center gap-4 pb-4 border-b border-border/30">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={data.imageUrl} alt={data.callName} />
                  <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
                    {data.callName?.[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Dog Photo</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsPhotoModalOpen(true)}
                      className="gap-2"
                    >
                      <Camera className="h-4 w-4" />
                      Change Photo
                    </Button>
                    {data.imageUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => updateData({ imageUrl: '' })}
                        className="gap-2 text-muted-foreground hover:text-destructive"
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="callName" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Call Name *</Label>
                  <Input
                    id="callName"
                    value={data.callName}
                    onChange={handleInputChange('callName')}
                    placeholder="Enter call name"
                    className={cn(
                      errors.some(e => e.includes('Call name')) && 'border-destructive'
                    )}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="registeredName" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Registered Name *</Label>
                  <Input
                    id="registeredName"
                    value={data.registeredName}
                    onChange={handleInputChange('registeredName')}
                    placeholder="Enter registered name"
                    className={cn(
                      errors.some(e => e.includes('Registered name')) && 'border-destructive'
                    )}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="gender" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Gender *</Label>
                  <Select value={data.gender} onValueChange={handleSelectChange('gender')}>
                    <SelectTrigger className={cn(
                      errors.some(e => e.includes('Gender')) && 'border-destructive'
                    )}>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="dateOfBirth" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Date of Birth *</Label>
                  <Input
                    id="dateOfBirth"
                    type="date"
                    value={data.dateOfBirth}
                    onChange={handleInputChange('dateOfBirth')}
                    className={cn(
                      errors.some(e => e.includes('Date of birth')) && 'border-destructive'
                    )}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="color" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Color</Label>
                  <Input
                    id="color"
                    value={data.color}
                    onChange={handleInputChange('color')}
                    placeholder="Enter color"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="weight" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Weight (lbs)</Label>
                  <Input
                    id="weight"
                    type="number"
                    value={data.weight}
                    onChange={handleInputChange('weight')}
                    placeholder="Enter weight"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="height" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Height (inches)</Label>
                  <Input
                    id="height"
                    type="number"
                    value={data.height}
                    onChange={handleInputChange('height')}
                    placeholder="Enter height"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="microchip" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Microchip Number</Label>
                <Input
                  id="microchip"
                  value={data.microchip}
                  onChange={handleInputChange('microchip')}
                  placeholder="Enter microchip number"
                />
              </div>

              {/* Owner Selection - Only shown for admins */}
              <OwnerSelectionField />

              <Separator />
              
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Additional Information
                </h4>
                
                <div className="space-y-2">
                  <Label htmlFor="notes" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Notes</Label>
                  <textarea
                    id="notes"
                    value={data.notes || ''}
                    onChange={handleInputChange('notes')}
                    placeholder="Enter additional notes about the dog"
                    className="min-h-[80px] w-full rounded-xl border-0 bg-input px-3.5 py-2.5 text-sm font-medium tracking-tight placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:bg-background focus-visible:shadow-sm transition-all duration-200"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="specialNeeds" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Special Needs</Label>
                  <textarea
                    id="specialNeeds"
                    value={data.specialNeeds || ''}
                    onChange={handleInputChange('specialNeeds')}
                    placeholder="Enter any special needs or requirements"
                    className="min-h-[60px] w-full rounded-xl border-0 bg-input px-3.5 py-2.5 text-sm font-medium tracking-tight placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:bg-background focus-visible:shadow-sm transition-all duration-200"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Registrations Tab */}
        <TabsContent value="registrations" className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out">
          <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Registrations
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.registrations?.length > 0 ? (
                <div className="space-y-4">
                  {data.registrations.map((reg, index) => (
                    <div key={index} className="border-l-4 border-primary pl-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Badge variant="default">
                            {reg.organization}
                          </Badge>
                          <span className="font-medium">#{reg.registrationNumber}</span>
                        </div>
                        <Badge variant={reg.status === 'Active' ? 'default' : 'secondary'}>
                          {reg.status}
                        </Badge>
                      </div>
                      {reg.breed && (
                        <div className="text-sm text-muted-foreground">
                          <span className="font-medium">Breed: </span>
                          {reg.breed}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No Registrations</h3>
                  <p className="text-sm text-muted-foreground">
                    This dog has no registrations on record.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Health Records Tab */}
        <TabsContent value="health" className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out">
          <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Heart className="h-5 w-5" />
                Health Records
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.healthRecords?.vaccinations?.length || data.healthRecords?.medications?.length || data.healthRecords?.allergies?.length ? (
                <div className="space-y-4">
                  {data.healthRecords?.vaccinations?.map((record, index) => (
                    <div key={`vax-${index}`} className="border-l-4 border-green-500 pl-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{record.name}</span>
                        <span className="text-sm text-muted-foreground">
                          {new Date(record.date).toLocaleDateString()}
                        </span>
                      </div>
                      {record.nextDue && (
                        <p className="text-sm text-muted-foreground">Next due: {new Date(record.nextDue).toLocaleDateString()}</p>
                      )}
                    </div>
                  ))}
                  {data.healthRecords?.medications?.map((record, index) => (
                    <div key={`med-${index}`} className="border-l-4 border-blue-500 pl-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{record.name}</span>
                        <span className="text-sm text-muted-foreground">
                          {record.dosage} - {record.frequency}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Started: {new Date(record.startDate).toLocaleDateString()}
                        {record.endDate && ` - Ended: ${new Date(record.endDate).toLocaleDateString()}`}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Heart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No Health Records</h3>
                  <p className="text-sm text-muted-foreground">
                    This dog has no health records on file.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Photo Dialog */}
      <PhotoDialog
        open={isPhotoModalOpen}
        onOpenChange={setIsPhotoModalOpen}
        previewImage={previewImage}
        currentPhoto={data.imageUrl || ''}
        isDragging={isDragging}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onFileInput={handleFileInput}
        onCancel={() => {
          setIsPhotoModalOpen(false);
          setPreviewImage(null);
        }}
        onSave={handlePhotoSave}
        title="Change Dog Photo"
        previewAlt={data.callName || 'Dog Photo'}
      />
    </div>
  );
};

// Helper to check if user has admin privileges
const isAdminRole = (role?: UserRole): boolean => {
  return role === UserRole.SITE_ADMIN ||
         role === UserRole.CLUB_ADMIN ||
         role === UserRole.SECRETARY;
};

// Main component
export const DogEditPanel: React.FC<DogEditPanelProps> = ({
  open,
  onClose,
  dogName,
  initialDogData,
  onSave,
  enableAutoSave = false,
  userRole,
  people = [],
}) => {
  // Convert dog data to form data
  const initialFormData = useMemo(() => dogToFormData(initialDogData), [initialDogData]);

  // Determine if user can edit owner
  const isAdmin = isAdminRole(userRole);

  // Context value for passing to form components
  const contextValue = useMemo(() => ({
    isAdmin,
    people,
  }), [isAdmin, people]);

  // Handle save
  const handleSave = useCallback(async (formData: DogFormData) => {
    const dogData = formDataToDog(formData);
    if (onSave) {
      await onSave(dogData);
    }
  }, [onSave]);

  return (
    <DogEditContext.Provider value={contextValue}>
      <EditPanelWrapper<DogFormData>
        open={open}
        onClose={onClose}
        title="Edit Dog"
        subtitle={`Editing profile for ${dogName}`}
        size="xl"
        initialData={initialFormData}
        onSave={handleSave}
        validateData={validateDogData}
        enableAutoSave={enableAutoSave}
        saveLabel="Save Changes"
        cancelLabel="Cancel"
      >
        <DogEditForm />
      </EditPanelWrapper>
    </DogEditContext.Provider>
  );
};

export default DogEditPanel;