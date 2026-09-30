import React, { useState, useCallback, useMemo } from 'react';
import { EditPanelWrapper } from './EditPanelWrapper';
import { useEditPanel } from './useEditPanel';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormField } from '@/components/common/FormField';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { WithdrawalPolicyCard } from '@/components/shows/WithdrawalPolicyCard';
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
import { Building, Camera, ArrowRight } from 'lucide-react';
import ClubPhotoDialog from '@/components/clubs/ClubPhotoDialog';
import { AccentColorPicker } from '@/components/ui/accent-color-picker';
import type { Club } from '@/types/club-types';
import { CLUB_TYPES } from '@/types/club-types';
import { logger } from '@/services/LoggingService';
import { PremiumTemplatesTab } from './ClubEditPanel/PremiumTemplatesTab';
import { ClubTabsList } from './ClubEditPanel/ClubTabsList';
import {
  CLUB_TAB_LABEL,
  CLUB_TAB_ORDER,
  locateInvalidField,
  type ClubTabValue,
} from './ClubEditPanel/validationTab';
import { ClubContactCard } from './ClubEditPanel/ClubContactCard';
import {
  clubEditSchema,
  clubToFormData,
  formDataToClub,
  type ClubEditFormData,
} from './ClubEditPanel/formData';
import { usePanelValidationNavigation } from './usePanelValidationNavigation';

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

// Form content component
const ClubEditForm: React.FC<{
  clubId: string;
  mode: 'create' | 'edit';
  onClose?: () => void;
  activeTab: ClubTabValue;
  onTabChange: (tab: ClubTabValue) => void;
}> = ({ clubId, mode, onClose, activeTab, onTabChange }) => {
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

  const fieldHandlers = { handleInputChange, handleBlur, handleSelectChange };

  return (
    <div className="space-y-6 p-6">
      <Tabs
        value={activeTab}
        onValueChange={value => onTabChange(value as ClubTabValue)}
        className="w-full"
      >
        <ClubTabsList mode={mode} data={data} errors={form?.errors ?? {}} />

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
                  <Label className="text-xs font-medium text-muted-foreground tracking-wide uppercase">
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
                  className="min-h-[80px] w-full rounded-xl border-0 bg-input px-3.5 py-2.5 text-sm font-medium tracking-tight placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:bg-background focus-visible:shadow-sm transition-all duration-200"
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

          {/*
            Club-wide default withdrawal refund policy (shows can override).
            Edit only: the card reads and writes the club row directly, and a
            refund policy is not something to answer while creating a club —
            least of all mid-wizard, where the club exists only to hang a show
            on (MYK9-454).
          */}
          {mode === 'edit' && <WithdrawalPolicyCard scope="club" entityId={clubId} />}
        </TabsContent>

        {/* Contact Information Tab */}
        <TabsContent
          value="contact"
          className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out"
        >
          <ClubContactCard {...fieldHandlers} data={data} form={form} />
        </TabsContent>

        {/* Premium Templates Tab */}
        <TabsContent
          value="premium"
          className="animate-in slide-in-from-bottom-2 duration-300 ease-out"
        >
          {mode === 'create' ? (
            // Templates hang off a club row, which does not exist yet.
            <p className="rounded-xl border border-border/30 bg-muted/30 p-4 text-sm text-muted-foreground">
              Premium templates are optional. You can set them up from the club's Premium tab once
              it has been created.
            </p>
          ) : (
            <PremiumTemplatesTab clubId={clubId} onClose={onClose} />
          )}
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
  // A failed save moves to the tab holding the first invalid field (MYK9-891).
  const { activeTab, setActiveTab, handleValidationFail } =
    usePanelValidationNavigation<ClubTabValue>('basic', locateInvalidField);
  const nextTab =
    mode === 'create' ? CLUB_TAB_ORDER[CLUB_TAB_ORDER.indexOf(activeTab) + 1] : undefined;

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
      onValidationFail={handleValidationFail}
      footerActions={
        nextTab ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setActiveTab(nextTab)}
            className="min-w-0 flex-1 gap-2 sm:flex-none"
          >
            Next: {CLUB_TAB_LABEL[nextTab]}
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : undefined
      }
    >
      <ClubEditForm
        clubId={clubId}
        mode={mode}
        onClose={onClose}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
    </EditPanelWrapper>
  );
};

export default ClubEditPanel;
