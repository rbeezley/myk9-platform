import React, { useEffect, useMemo } from 'react';
import { EditPanelWrapper } from '../EditPanelWrapper';
import { useEditPanel } from '../useEditPanel';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import PhotoDialog from '@/components/common/PhotoDialog';
import { AddEditRegistrationDialog } from '@/components/dogs/AddEditRegistrationDialog';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { DogInput } from '@/store/dogStore';
import { UserRole } from '@/types/auth-types';
import type { AddDogPanelProps, DogFormData } from './types';
import { INITIAL_FORM_DATA } from './types';
import { addDogSchema, isTabValid } from './validation';
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

  // Stable initial data — recalculated when userRole or currentUserPersonId changes
  const initialFormData = useMemo<DogFormData>(
    () => ({
      ...INITIAL_FORM_DATA,
      ownerId: userRole === UserRole.EXHIBITOR ? (currentUserPersonId || '') : '',
    }),
    [userRole, currentUserPersonId]
  );

  // Handle save: map DogFormData -> DogInput and persist
  const handleSave = async (formData: DogFormData) => {
    const dogInput: DogInput = {
      name: formData.callName,
      callName: formData.callName,
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
        registeredName: reg.registeredName,
        type: reg.breed,
        status: reg.status || 'active',
      })),
    };

    const newDog = await addDog(dogInput);
    onDogCreated(newDog);
  };

  return (
    <EditPanelWrapper<DogFormData>
      open={open}
      onClose={onClose}
      title="Add New Dog"
      initialData={initialFormData}
      schema={addDogSchema}
      onSave={handleSave}
      forceHasChanges
      size="xl"
      saveLabel={isSaving ? 'Creating...' : 'Create Dog'}
      enableAutoSave={false}
      showUnsavedWarning={true}
    >
      <AddDogPanelContent
        open={open}
        userRole={userRole}
        currentUserPersonId={currentUserPersonId}
        saveError={saveError}
      />
    </EditPanelWrapper>
  );
};

/** Inner component rendered within EditPanelWrapper so it can access useEditPanel context */
interface AddDogPanelContentProps {
  open: boolean;
  userRole: UserRole;
  currentUserPersonId?: string | undefined;
  saveError: string | null;
}

const AddDogPanelContent: React.FC<AddDogPanelContentProps> = ({
  open,
  userRole,
  currentUserPersonId,
  saveError,
}) => {
  const { form } = useEditPanel<DogFormData>();

  // The hook needs form to manage registrations/photos via context
  const uiState = useAddDogForm({ open, form: form! });

  const {
    activeTab,
    setActiveTab,
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
    handleSaveRegistration,
    handleRemoveRegistration,
    handlePhotoDialogOpen,
    handlePhotoDrop,
    handlePhotoFileInput,
    handlePhotoSave,
    openAddRegistration,
    openEditRegistration,
  } = uiState;

  // Sync ownerId when currentUserPersonId resolves asynchronously
  useEffect(() => {
    if (currentUserPersonId && userRole === UserRole.EXHIBITOR && form && !form.data.ownerId) {
      form.setValue('ownerId', currentUserPersonId);
    }
  }, [currentUserPersonId, userRole, form]);

  // Reset form when panel re-opens
  const [prevOpen, setPrevOpen] = React.useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open && form) {
      form.reset({
        ...INITIAL_FORM_DATA,
        ownerId: userRole === UserRole.EXHIBITOR ? (currentUserPersonId || '') : '',
      });
    }
  }

  if (!form) return null;

  const formData = form.data;

  // Tab validity for navigation indicators
  const isBasicValid = isTabValid('basic', formData);
  const isRegistrationValid = isTabValid('registration', formData);
  const isOptionalValid = isTabValid('optional', formData);

  return (
    <>
      <div className="space-y-8">
        {/* Error Display */}
        {saveError && (
          <Alert className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
            <AlertDescription className="text-red-800 dark:text-red-300">
              {saveError}
            </AlertDescription>
          </Alert>
        )}

        {/* Tabbed Content */}
        <Tabs
          value={activeTab}
          onValueChange={value => setActiveTab(value as 'basic' | 'registration' | 'optional')}
        >
          <TabNavigation
            isBasicValid={isBasicValid}
            isRegistrationValid={isRegistrationValid}
            isOptionalValid={isOptionalValid}
          />

          <TabsContent
            value="basic"
            className="space-y-8 mt-8 animate-in slide-in-from-bottom-2 duration-500 ease-apple"
          >
            <BasicInfoTab
              userRole={userRole}
              currentUserPersonId={currentUserPersonId}
              onPhotoOpen={() => handlePhotoDialogOpen(true)}
            />
          </TabsContent>

          <TabsContent value="registration" className="space-y-8 mt-8">
            <RegistrationTab
              onRemoveRegistration={handleRemoveRegistration}
              onEditRegistration={openEditRegistration}
              onAddRegistration={openAddRegistration}
            />
          </TabsContent>

          <TabsContent value="optional" className="space-y-8 mt-8">
            <AdditionalInfoTab />
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
        onDragOver={e => {
          e.preventDefault();
          setIsPhotoDragging(true);
        }}
        onDragLeave={e => {
          e.preventDefault();
          setIsPhotoDragging(false);
        }}
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
    </>
  );
};
