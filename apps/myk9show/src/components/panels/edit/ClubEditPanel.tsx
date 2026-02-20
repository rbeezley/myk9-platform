import React, { useState, useCallback, useMemo } from 'react';
import { EditPanelWrapper } from './EditPanelWrapper';
import { useEditPanel } from './useEditPanel';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building, MapPin, Phone, Camera } from 'lucide-react';
import ClubPhotoDialog from '@/components/clubs/ClubPhotoDialog';
import type { Club } from '@/types/club-types';
import { CLUB_TYPES, COUNTRIES, DEFAULT_COUNTRY } from '@/types/club-types';
import { cn } from '@/lib/utils';
import { logger } from '@/services/LoggingService';

interface ClubEditPanelProps {
  open: boolean;
  onClose: () => void;
  clubId: string;
  clubName: string;
  initialClubData: Partial<Club>;
  onSave?: (clubData: Partial<Club>) => Promise<void>;
  enableAutoSave?: boolean;
  showAdvancedFields?: boolean;
  /** Set to 'create' when adding a new club. Defaults to 'edit'. */
  mode?: 'create' | 'edit';
}

// Form data interface extending ClubFormData for edit panel needs
interface ClubEditFormData extends Record<string, unknown> {
  name: string;
  clubNumber: string;
  email: string;
  phone: string;
  website: string;
  description: string;
  logo: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  founded?: string; // ISO date string for forms
  clubType?: string;
}

// Form validation
const validateClubData = (data: ClubEditFormData): string[] | null => {
  const errors: string[] = [];

  if (!data.name?.trim()) {
    errors.push('Club name is required');
  }

  if (!data.email?.trim()) {
    errors.push('Email is required');
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push('Please enter a valid email address');
  }

  if (!data.phone?.trim()) {
    errors.push('Phone number is required');
  } else if (!/^[\d\s\-().+]+$/.test(data.phone.trim())) {
    errors.push('Please enter a valid phone number');
  }

  if (!data.street?.trim()) {
    errors.push('Street address is required');
  }

  if (!data.city?.trim()) {
    errors.push('City is required');
  }

  if (!data.state?.trim()) {
    errors.push('State/Province is required');
  }

  if (!data.zipCode?.trim()) {
    errors.push('ZIP/Postal code is required');
  }

  if (!data.country?.trim()) {
    errors.push('Country is required');
  }

  // Website validation if provided
  if (data.website && data.website.trim()) {
    try {
      new URL(data.website);
    } catch {
      errors.push('Please enter a valid website URL');
    }
  }

  return errors.length > 0 ? errors : null;
};

// Convert Club to form data
const clubToFormData = (club: Partial<Club>): ClubEditFormData => {
  return {
    name: club.name || '',
    clubNumber: club.clubNumber || '',
    email: club.email || '',
    phone: club.phone || '',
    website: club.website || '',
    description: club.description || '',
    logo: club.logo || '',
    street: club.address?.street || '',
    city: club.address?.city || '',
    state: club.address?.state || '',
    zipCode: club.address?.zipCode || '',
    country: club.address?.country || DEFAULT_COUNTRY,
    founded: club.founded ? new Date(club.founded).toISOString().slice(0, 10) : '',
    clubType: club.clubType || '',
  };
};

// Convert form data back to Club
const formDataToClub = (formData: ClubEditFormData): Partial<Club> => ({
  name: formData.name,
  clubNumber: formData.clubNumber,
  email: formData.email,
  phone: formData.phone,
  website: formData.website || undefined,
  description: formData.description,
  logo: formData.logo,
  address: {
    street: formData.street,
    city: formData.city,
    state: formData.state,
    zipCode: formData.zipCode,
    country: formData.country,
  },
  founded: formData.founded ? new Date(formData.founded) : undefined,
  clubType: formData.clubType as Club['clubType'] || undefined,
});

// Form content component
const ClubEditForm: React.FC = () => {
  const { data, updateData, errors } = useEditPanel<ClubEditFormData>();
  
  // Photo dialog state
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Handle input changes
  const handleInputChange = useCallback((field: keyof ClubEditFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    updateData({ [field]: e.target.value });
  }, [updateData]);

  // Handle select changes
  const handleSelectChange = useCallback((field: keyof ClubEditFormData) => (value: string) => {
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

  const handlePhotoSave = useCallback((savedImage: string | null) => {
    if (savedImage) {
      updateData({ logo: savedImage });
    }
    setIsPhotoModalOpen(false);
    setPreviewImage(null);
  }, [updateData]);
  
  return (
    <div className="space-y-6 p-6">
      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1 transition-all duration-300 ease-out">
          <TabsTrigger
            value="basic"
            className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            <Building className="h-4 w-4" />
            Basic Info
          </TabsTrigger>
          <TabsTrigger
            value="contact"
            className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            <Phone className="h-4 w-4" />
            Contact
          </TabsTrigger>
        </TabsList>

        {/* Basic Information Tab */}
        <TabsContent value="basic" className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out">
          <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                Club Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Club Logo Section */}
              <div className="flex items-center gap-4 pb-4 border-b border-border/30">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={data.logo} alt={data.name} />
                  <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
                    {data.name?.[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Club Logo</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsPhotoModalOpen(true)}
                      className="gap-2"
                    >
                      <Camera className="h-4 w-4" />
                      Change Logo
                    </Button>
                    {data.logo && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => updateData({ logo: '' })}
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
                  <Label htmlFor="name" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Club Name *</Label>
                  <Input
                    id="name"
                    value={data.name}
                    onChange={handleInputChange('name')}
                    placeholder="Enter club name"
                    className={cn(
                      errors.some(e => e.includes('Club name')) && 'border-destructive'
                    )}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="clubNumber" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Club Number</Label>
                  <Input
                    id="clubNumber"
                    value={data.clubNumber}
                    onChange={handleInputChange('clubNumber')}
                    placeholder="Enter club number"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Description</Label>
                <textarea
                  id="description"
                  value={data.description || ''}
                  onChange={handleInputChange('description')}
                  placeholder="Enter club description"
                  className="min-h-[80px] w-full rounded-xl border-0 bg-input px-3.5 py-2.5 text-sm font-medium tracking-tight placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:bg-background focus-visible:shadow-sm transition-all duration-200"
                />
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="clubType" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Club Type</Label>
                  <Select
                    value={data.clubType || ''}
                    onValueChange={handleSelectChange('clubType')}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select club type" />
                    </SelectTrigger>
                    <SelectContent>
                      {CLUB_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="founded" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Founded</Label>
                  <Input
                    id="founded"
                    type="date"
                    value={data.founded || ''}
                    onChange={handleInputChange('founded')}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contact Information Tab */}
        <TabsContent value="contact" className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out">
          <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5" />
                Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={data.email}
                    onChange={handleInputChange('email')}
                    placeholder="Enter email address"
                    className={cn(
                      errors.some(e => e.includes('email') || e.includes('Email')) && 'border-destructive'
                    )}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Phone Number *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={data.phone}
                    onChange={handleInputChange('phone')}
                    placeholder="Enter phone number"
                    className={cn(
                      errors.some(e => e.includes('Phone')) && 'border-destructive'
                    )}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="website" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Website</Label>
                <Input
                  id="website"
                  type="url"
                  value={data.website}
                  onChange={handleInputChange('website')}
                  placeholder="https://www.clubwebsite.com"
                  className={cn(
                    errors.some(e => e.includes('website') || e.includes('URL')) && 'border-destructive'
                  )}
                />
              </div>
              
              <Separator />
              
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <MapPin className="h-3 w-3" />
                  Address Information
                </h4>
                
                <div className="space-y-2">
                  <Label htmlFor="street" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Street Address *</Label>
                  <Input
                    id="street"
                    value={data.street}
                    onChange={handleInputChange('street')}
                    placeholder="123 Main Street"
                    className={cn(
                      errors.some(e => e.includes('Street')) && 'border-destructive'
                    )}
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">City *</Label>
                    <Input
                      id="city"
                      value={data.city}
                      onChange={handleInputChange('city')}
                      placeholder="Enter city"
                      className={cn(
                        errors.some(e => e.includes('City')) && 'border-destructive'
                      )}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="state" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">State/Province *</Label>
                    <Input
                      id="state"
                      value={data.state}
                      onChange={handleInputChange('state')}
                      placeholder="Enter state"
                      className={cn(
                        errors.some(e => e.includes('State')) && 'border-destructive'
                      )}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="zipCode" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">ZIP Code *</Label>
                    <Input
                      id="zipCode"
                      value={data.zipCode}
                      onChange={handleInputChange('zipCode')}
                      placeholder="12345"
                      className={cn(
                        errors.some(e => e.includes('ZIP')) && 'border-destructive'
                      )}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="country" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Country *</Label>
                  <Select
                    value={data.country}
                    onValueChange={handleSelectChange('country')}
                  >
                    <SelectTrigger className={cn(
                      errors.some(e => e.includes('Country')) && 'border-destructive'
                    )}>
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((country) => (
                        <SelectItem key={country.value} value={country.value}>
                          {country.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Club Photo Dialog */}
      <ClubPhotoDialog
        open={isPhotoModalOpen}
        onOpenChange={setIsPhotoModalOpen}
        previewImage={previewImage}
        currentPhoto={data.logo || ''}
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
      />
    </div>
  );
};

// Main component
export const ClubEditPanel: React.FC<ClubEditPanelProps> = ({
  open,
  onClose,
  clubName,
  initialClubData,
  onSave,
  enableAutoSave = false,
  mode = 'edit',
}) => {
  // Convert club data to form data
  const initialFormData = useMemo(() => clubToFormData(initialClubData), [initialClubData]);
  
  // Handle save
  const handleSave = useCallback(async (formData: ClubEditFormData) => {
    logger.debug('ClubEditPanel handleSave - Raw form data:', 'panels', { data: formData });
    const clubData = formDataToClub(formData);
    logger.debug('ClubEditPanel handleSave - Converted club data:', 'panels', { data: clubData });
    if (onSave) {
      await onSave(clubData);
    }
  }, [onSave]);

  return (
    <EditPanelWrapper<ClubEditFormData>
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'Create Club' : 'Edit Club'}
      subtitle={mode === 'create' ? 'Fill in the details for your new club' : `Editing profile for ${clubName}`}
      size="xl"
      initialData={initialFormData}
      onSave={handleSave}
      validateData={validateClubData}
      enableAutoSave={enableAutoSave}
      saveLabel={mode === 'create' ? 'Create Club' : 'Save Changes'}
      cancelLabel="Cancel"
    >
      <ClubEditForm />
    </EditPanelWrapper>
  );
};

export default ClubEditPanel;