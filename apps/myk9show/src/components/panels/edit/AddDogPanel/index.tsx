import React, { useMemo } from 'react';
import { EditPanelWrapper } from '../EditPanelWrapper';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import PhotoDialog from '@/components/common/PhotoDialog';
import { AddEditRegistrationDialog } from '@/components/dogs/AddEditRegistrationDialog';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { DogInput } from '@/store/dogStore';
import { UserRole } from '@/types/auth-types';
import { logger } from '@/services/LoggingService';

import type { AddDogPanelProps, DogFormData } from './types';
import { validateDogData, isTabValid } from './validation';
import { useAddDogForm } from './useAddDogForm';
import { TabNavigation } from './TabNavigation';
import { BasicInfoTab } from './BasicInfoTab';
import { RegistrationTab } from './RegistrationTab';
import { AdditionalInfoTab } from './AdditionalInfoTab';

export type { AddDogPanelProps } from './types';

export const AddDogPanel: React.FC<AddDogPanelProps> = ({
  open,
  onClose,
  onDogCreated,
  userRole = UserRole.EXHIBITOR,
  currentUserPersonId,
}) => {
  const { addDog, isLoading: isSaving, error: saveError } = useDogStoreCompat();

  const form = useAddDogForm({ open, userRole, currentUserPersonId });

  const {
    formData,
    validationErrors,
    setValidationErrors,
    activeTab,
    setActiveTab,
    isCreating,
    setIsCreating,
    // Photo state
    isPhotoDialogOpen,
    photoPreview,
    isPhotoDragging,
    setIsPhotoDragging,
    // Registration dialog state
    isAddEditRegDialogOpen,
    setIsAddEditRegDialogOpen,
    currentRegToEdit,
    // Handlers
    handleFieldChange,
    handleSaveRegistration,
    handleRemoveRegistration,
    handlePhotoDialogOpen,
    handlePhotoDrop,
    handlePhotoFileInput,
    handlePhotoSave,
    openAddRegistration,
    openEditRegistration,
  } = form;

  // Handle form submission
  const handleSave = async () => {
    const errors = validateDogData(formData);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    setIsCreating(true);
    try {
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

      const newDog = await addDog(dogInput);
      onDogCreated(newDog);
      onClose();
    } catch (error) {
      logger.error('Error creating dog:', 'components', {}, error as Error);
      setValidationErrors({
        submit: error instanceof Error ? error.message : 'Failed to create dog',
      });
    } finally {
      setIsCreating(false);
    }
  };

  // Tab validity for navigation indicators
  const isBasicValid = useMemo(() => isTabValid('basic', formData), [formData]);
  const isRegistrationValid = useMemo(() => isTabValid('registration', formData), [formData]);
  const isOptionalValid = useMemo(() => isTabValid('optional', formData), [formData]);

  // Panel subtitle
  const panelSubtitle = useMemo(() => {
    const completedTabs = [isBasicValid, isRegistrationValid, isOptionalValid].filter(Boolean).length;
    return `${completedTabs} of 3 sections complete`;
  }, [isBasicValid, isRegistrationValid, isOptionalValid]);

  return (
    <EditPanelWrapper
      open={open}
      onClose={onClose}
      title="Add New Dog"
      subtitle={panelSubtitle}
      initialData={formData}
      onSave={async () => await handleSave()}
      validateData={(data) => {
        const castData = data as DogFormData;
        const hasRequiredFields = castData.callName?.trim() &&
                                  castData.gender &&
                                  castData.dateOfBirth &&
                                  castData.ownerId;

        if (!hasRequiredFields) {
          const missingFields: string[] = [];
          if (!castData.callName?.trim()) missingFields.push('Call name');
          if (!castData.gender) missingFields.push('Gender');
          if (!castData.dateOfBirth) missingFields.push('Date of birth');
          if (!castData.ownerId) missingFields.push('Owner');
          return [`Missing required fields: ${missingFields.join(', ')}`];
        }

        if (castData.dateOfBirth) {
          const birthDate = new Date(castData.dateOfBirth);
          const now = new Date();
          if (birthDate > now) {
            return ['Date of birth cannot be in the future'];
          }
          if (birthDate < new Date(now.getFullYear() - 30, 0, 1)) {
            return ['Date of birth seems too far in the past'];
          }
        }

        return null;
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

        {/* Tabbed Content */}
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'basic' | 'registration' | 'optional')}>
          <TabNavigation
            isBasicValid={isBasicValid}
            isRegistrationValid={isRegistrationValid}
            isOptionalValid={isOptionalValid}
          />

          <TabsContent value="basic" className="space-y-8 mt-8 animate-in slide-in-from-bottom-2 duration-500 ease-apple">
            <BasicInfoTab
              formData={formData}
              validationErrors={validationErrors}
              onFieldChange={handleFieldChange}
              userRole={userRole}
              currentUserPersonId={currentUserPersonId}
              onPhotoOpen={() => handlePhotoDialogOpen(true)}
            />
          </TabsContent>

          <TabsContent value="registration" className="space-y-8 mt-8">
            <RegistrationTab
              formData={formData}
              onRemoveRegistration={handleRemoveRegistration}
              onEditRegistration={openEditRegistration}
              onAddRegistration={openAddRegistration}
            />
          </TabsContent>

          <TabsContent value="optional" className="space-y-8 mt-8">
            <AdditionalInfoTab
              formData={formData}
              validationErrors={validationErrors}
              onFieldChange={handleFieldChange}
            />
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
        onCancel={() => handlePhotoDialogOpen(false)}
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
