import React, { useState, useCallback, useMemo } from 'react';
import { EditPanelWrapper } from './EditPanelWrapper';
import { useEditPanel } from './useEditPanel';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormField } from '@/components/common/FormField';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Building, MapPin, Phone, Camera } from 'lucide-react';
import { z } from 'zod';
import { clubSchemas } from '@/lib/validation';
import ClubPhotoDialog from '@/components/clubs/ClubPhotoDialog';
import { AccentColorPicker } from '@/components/ui/accent-color-picker';
import type { Club } from '@/types/club-types';
import { CLUB_TYPES, COUNTRIES, DEFAULT_COUNTRY } from '@/types/club-types';
import { logger } from '@/services/LoggingService';
import { PremiumTemplatesTab } from './ClubEditPanel/PremiumTemplatesTab';

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

// Zod schema for club edit form
const clubEditSchema = clubSchemas.basic;

// Form data type derived from the Zod schema
type ClubEditFormData = z.infer<typeof clubEditSchema> & Record<string, unknown>;

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
    accentColor: club.accentColor || '',
  };
};

// Convert form data back to Club
const formDataToClub = (formData: ClubEditFormData): Partial<Club> => ({
  name: formData.name,
  clubNumber: formData.clubNumber ?? '',
  email: formData.email,
  phone: formData.phone,
  website: formData.website || undefined,
  description: formData.description ?? '',
  logo: formData.logo ?? '',
  address: {
    street: formData.street,
    city: formData.city,
    state: formData.state,
    zipCode: formData.zipCode,
    country: formData.country,
  },
  founded: formData.founded ? new Date(formData.founded) : undefined,
  clubType: (formData.clubType as Club['clubType']) || undefined,
  accentColor: formData.accentColor ?? '',
});

// Form content component
const ClubEditForm: React.FC<{ clubId: string; onClose?: () => void }> = ({ clubId, onClose }) => {
  const { data, form } = useEditPanel<ClubEditFormData>();

  // Photo dialog state
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Handle input changes
  const handleInputChange = useCallback(
    (field: keyof ClubEditFormData) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        form?.setValue(field, e.target.value);
      },
    [form]
  );

  // Handle blur to touch field for validation
  const handleBlur = useCallback(
    (field: keyof ClubEditFormData) => () => {
      form?.touchField(field);
    },
    [form]
  );

  // Handle select changes
  const handleSelectChange = useCallback(
    (field: keyof ClubEditFormData) => (value: string) => {
      form?.setValue(field, value);
      form?.touchField(field);
    },
    [form]
  );

  // Handle file upload (shared logic for drag & drop and file input)
  const handleFileUpload = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = ev => {
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

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        handleFileUpload(file);
      }
    },
    [handleFileUpload]
  );

  // File input handler
  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileUpload(file);
      }
    },
    [handleFileUpload]
  );

  const handlePhotoSave = useCallback(
    (savedImage: string | null) => {
      if (savedImage) {
        form?.setValue('logo', savedImage);
      }
      setIsPhotoModalOpen(false);
      setPreviewImage(null);
    },
    [form]
  );

  return (
    <div className="space-y-6 p-6">
      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1 transition-all duration-300 ease-out">
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
          <TabsTrigger
            value="premium"
            className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            Premium
          </TabsTrigger>
        </TabsList>

        {/* Basic Information Tab */}
        <TabsContent
          value="basic"
          className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out"
        >
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
                  <Label className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                    Club Logo
                  </Label>
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
                        onClick={() => form?.setValue('logo', '')}
                        className="gap-2 text-muted-foreground hover:text-destructive"
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Club Name" fieldId="name" required error={form?.getError('name')}>
                  <Input
                    id="name"
                    value={data.name}
                    onChange={handleInputChange('name')}
                    onBlur={handleBlur('name')}
                    placeholder="Enter club name"
                    {...form?.getFieldProps('name')}
                  />
                </FormField>

                <FormField label="Club Number" fieldId="clubNumber">
                  <Input
                    id="clubNumber"
                    value={data.clubNumber}
                    onChange={handleInputChange('clubNumber')}
                    onBlur={handleBlur('clubNumber')}
                    placeholder="Enter club number"
                  />
                </FormField>
              </div>

              <FormField label="Description" fieldId="description">
                <textarea
                  id="description"
                  value={data.description || ''}
                  onChange={handleInputChange('description')}
                  onBlur={handleBlur('description')}
                  placeholder="Enter club description"
                  className="min-h-[80px] w-full rounded-xl border-0 bg-input px-3.5 py-2.5 text-sm font-medium tracking-tight placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:bg-background focus-visible:shadow-sm transition-all duration-200"
                />
              </FormField>

              <div className="space-y-2">
                <AccentColorPicker
                  value={data.accentColor || null}
                  onChange={color => form?.setValue('accentColor', color ?? '')}
                />
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Club Type" fieldId="clubType">
                  <Select
                    value={data.clubType || ''}
                    onValueChange={handleSelectChange('clubType')}
                  >
                    <SelectTrigger id="clubType">
                      <SelectValue placeholder="Select club type" />
                    </SelectTrigger>
                    <SelectContent>
                      {CLUB_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>

                <FormField label="Founded" fieldId="founded" error={form?.getError('founded')}>
                  <Input
                    id="founded"
                    type="date"
                    value={data.founded || ''}
                    onChange={handleInputChange('founded')}
                    onBlur={handleBlur('founded')}
                    {...form?.getFieldProps('founded')}
                  />
                </FormField>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contact Information Tab */}
        <TabsContent
          value="contact"
          className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out"
        >
          <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5" />
                Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  label="Email Address"
                  fieldId="email"
                  required
                  error={form?.getError('email')}
                >
                  <Input
                    id="email"
                    type="email"
                    value={data.email}
                    onChange={handleInputChange('email')}
                    onBlur={handleBlur('email')}
                    placeholder="Enter email address"
                    {...form?.getFieldProps('email')}
                  />
                </FormField>

                <FormField
                  label="Phone Number"
                  fieldId="phone"
                  required
                  error={form?.getError('phone')}
                >
                  <Input
                    id="phone"
                    type="tel"
                    value={data.phone}
                    onChange={handleInputChange('phone')}
                    onBlur={handleBlur('phone')}
                    placeholder="Enter phone number"
                    {...form?.getFieldProps('phone')}
                  />
                </FormField>
              </div>

              <FormField label="Website" fieldId="website" error={form?.getError('website')}>
                <Input
                  id="website"
                  type="url"
                  value={data.website}
                  onChange={handleInputChange('website')}
                  onBlur={handleBlur('website')}
                  placeholder="https://www.clubwebsite.com"
                  {...form?.getFieldProps('website')}
                />
              </FormField>

              <Separator />

              <div className="space-y-4">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <MapPin className="h-3 w-3" />
                  Address Information
                </h4>

                <FormField
                  label="Street Address"
                  fieldId="street"
                  required
                  error={form?.getError('street')}
                >
                  <Input
                    id="street"
                    value={data.street}
                    onChange={handleInputChange('street')}
                    onBlur={handleBlur('street')}
                    placeholder="123 Main Street"
                    {...form?.getFieldProps('street')}
                  />
                </FormField>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField label="City" fieldId="city" required error={form?.getError('city')}>
                    <Input
                      id="city"
                      value={data.city}
                      onChange={handleInputChange('city')}
                      onBlur={handleBlur('city')}
                      placeholder="Enter city"
                      {...form?.getFieldProps('city')}
                    />
                  </FormField>

                  <FormField
                    label="State/Province"
                    fieldId="state"
                    required
                    error={form?.getError('state')}
                  >
                    <Input
                      id="state"
                      value={data.state}
                      onChange={handleInputChange('state')}
                      onBlur={handleBlur('state')}
                      placeholder="Enter state"
                      {...form?.getFieldProps('state')}
                    />
                  </FormField>

                  <FormField
                    label="ZIP Code"
                    fieldId="zipCode"
                    required
                    error={form?.getError('zipCode')}
                  >
                    <Input
                      id="zipCode"
                      value={data.zipCode}
                      onChange={handleInputChange('zipCode')}
                      onBlur={handleBlur('zipCode')}
                      placeholder="12345"
                      {...form?.getFieldProps('zipCode')}
                    />
                  </FormField>
                </div>

                <FormField
                  label="Country"
                  fieldId="country"
                  required
                  error={form?.getError('country')}
                >
                  <Select value={data.country} onValueChange={handleSelectChange('country')}>
                    <SelectTrigger id="country" {...form?.getFieldProps('country')}>
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map(country => (
                        <SelectItem key={country.value} value={country.value}>
                          {country.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Premium Templates Tab */}
        <TabsContent
          value="premium"
          className="animate-in slide-in-from-bottom-2 duration-300 ease-out"
        >
          <PremiumTemplatesTab clubId={clubId} onClose={onClose} />
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
  clubId,
  clubName,
  initialClubData,
  onSave,
  enableAutoSave = false,
  mode = 'edit',
}) => {
  // Convert club data to form data
  const initialFormData = useMemo(() => clubToFormData(initialClubData), [initialClubData]);

  // Handle save
  const handleSave = useCallback(
    async (formData: ClubEditFormData) => {
      logger.debug('ClubEditPanel handleSave - Raw form data:', 'panels', { data: formData });
      const clubData = formDataToClub(formData);
      logger.debug('ClubEditPanel handleSave - Converted club data:', 'panels', { data: clubData });
      if (onSave) {
        await onSave(clubData);
      }
    },
    [onSave]
  );

  return (
    <EditPanelWrapper<ClubEditFormData>
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'Create Club' : 'Edit Club'}
      subtitle={
        mode === 'create'
          ? 'Fill in the details for your new club'
          : `Editing profile for ${clubName}`
      }
      size="xl"
      initialData={initialFormData}
      onSave={handleSave}
      schema={clubEditSchema}
      enableAutoSave={enableAutoSave}
      saveLabel={mode === 'create' ? 'Create Club' : 'Save Changes'}
      cancelLabel="Cancel"
    >
      <ClubEditForm clubId={clubId} onClose={onClose} />
    </EditPanelWrapper>
  );
};

export default ClubEditPanel;
