import React, { useEffect, useMemo, useState } from 'react';
import { EditPanelWrapper } from '../EditPanelWrapper';
import { useEditPanel } from '../useEditPanel';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';
import PhotoDialog from '@/components/common/PhotoDialog';
import { AddEditRegistrationDialog } from '@/components/dogs/AddEditRegistrationDialog';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { DogInput } from '@/store/dogStore';
import type { Dog } from '@/types/dog-types';
import { UserRole } from '@/types/auth-types';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import { getErrorMessage } from '@myk9/core';
import type { AddDogPanelProps, DogFormData } from './types';
import { createInitialFormData } from './types';
import { addDogSchema, isTabValid } from './validation';
import { buildDogSavedToast } from './dogSavedToast';
import { useAddDogForm } from './useAddDogForm';
import { TabNavigation } from './TabNavigation';
import { BasicInfoTab } from './BasicInfoTab';
import { RegistrationTab } from './RegistrationTab';
import { AdditionalInfoTab } from './AdditionalInfoTab';
import { findLikelyDuplicateDogCandidate, type DogIdentityCandidate } from '@/utils/dogIdentity';

export type { AddDogPanelProps } from './types';

export const AddDogPanel: React.FC<AddDogPanelProps> = props => (
  <AddDogPanelSession key={props.open ? 'open' : 'closed'} {...props} />
);

const AddDogPanelSession: React.FC<AddDogPanelProps> = ({
  open,
  onClose,
  onDogCreated,
  userRole = UserRole.EXHIBITOR,
  currentUserPersonId,
  variant = 'panel',
  offlineFirst = false,
  offlineDependsOn,
  onEnterShowWithDog,
}) => {
  const {
    addDog,
    addDogOfflineFirst,
    dogs,
    isLoading: isSaving,
    error: saveError,
  } = useDogStoreCompat();
  const [localSaveError, setLocalSaveError] = useState<string | null>(null);
  const [duplicateCandidate, setDuplicateCandidate] = useState<DogIdentityCandidate | null>(null);
  const [allowSeparateDog, setAllowSeparateDog] = useState(false);

  // Stable initial data — recalculated when currentUserPersonId changes.
  // INTENT: when the panel opens with a contextual person (e.g. secretary
  // clicking "Add New Dog" from a Person profile), pre-fill the owner so they
  // don't have to scroll a global picker. Was previously gated to EXHIBITOR
  // only; that misses the more common secretary-on-behalf-of flow.
  const initialFormData = useMemo<DogFormData>(
    () => ({
      ...createInitialFormData(),
      ownerId: currentUserPersonId || '',
    }),
    [currentUserPersonId]
  );

  // Handle save: map DogFormData -> DogInput and persist
  const handleSave = async (formData: DogFormData) => {
    setLocalSaveError(null);
    setDuplicateCandidate(null);
    if (!allowSeparateDog) {
      const firstRegistration = formData.registrations[0];
      const candidate = findLikelyDuplicateDogCandidate(dogs, {
        ownerId: formData.ownerId,
        callName: formData.callName,
        registeredName: firstRegistration?.registeredName,
        breed: firstRegistration?.breed,
        sex: formData.gender === 'Female' ? 'female' : 'male',
        dateOfBirth: formData.dateOfBirth,
        microchipNumber: formData.microchip,
        registrations: formData.registrations.map(registration => ({
          organization: registration.organization,
          registrationNumber: registration.registrationNumber,
        })),
      });

      if (candidate) {
        setDuplicateCandidate(candidate);
        throw new Error('This looks like a dog already in myK9. Review the match before saving.');
      }
    }

    const weight = formData.weight ? parseFloat(formData.weight) : undefined;
    const height = formData.height ? parseFloat(formData.height) : undefined;
    const dogInput: DogInput = {
      // MYK9-90 §5.3 — the call name is no longer copied here. `DogInput.name`
      // now only ever carries a registered name, and the create path does not
      // persist it to the legacy `dogs.name` column at all: the registered name
      // is written to `dog_registrations.registered_name` from `registrations`
      // below. Left as the registration's registered name (or empty) so the
      // in-memory input stays honest about what the field means.
      name: formData.registrations?.[0]?.registeredName || '',
      callName: formData.callName,
      // No-registration dogs are saved as "Mixed Breed" — a disclosed default
      // the RegistrationTab empty state states explicitly (task 4.E). Keep it in
      // sync with that copy; don't silently store a blank here.
      breed: formData.registrations?.[0]?.breed || 'Mixed Breed',
      birthDate: formData.dateOfBirth,
      sex: formData.gender === 'Female' ? 'female' : 'male',
      color: formData.color,
      weight: typeof weight === 'number' && Number.isFinite(weight) ? weight : undefined,
      height: typeof height === 'number' && Number.isFinite(height) ? height : undefined,
      ownerId: formData.ownerId,
      microchipNumber: formData.microchip || undefined,
      imageUrl: formData.imageUrl || undefined,
      spayedNeutered: formData.spayedNeutered,
      registrations: formData.registrations?.map(reg => ({
        organization: reg.organization,
        number: reg.registrationNumber,
        registeredName: reg.registeredName,
        type: reg.breed,
        status: reg.status || 'Active',
      })),
    };

    let newDog;
    try {
      newDog = offlineFirst
        ? await addDogOfflineFirst(
            dogInput,
            offlineDependsOn && offlineDependsOn.length > 0 ? { dependsOn: offlineDependsOn } : {}
          )
        : await addDog(dogInput);
    } catch (error) {
      setLocalSaveError(getErrorMessage(error));
      throw error;
    }
    // 4.E: a durable "Dog saved" confirmation. The panel used to just close
    // silently, leaving a novice unsure the save worked. Fire before the
    // parent callback (which may navigate) so the toast survives the route
    // change; sonner keeps it on screen. The optional "Enter a show" action
    // only appears where the caller opts in (standalone Dogs page).
    const savedToast = buildDogSavedToast(formData.callName, newDog, onEnterShowWithDog);
    notifications.success(savedToast.message, savedToast.options);
    // Once the dog is persisted, a failure in the parent callback must not
    // bubble up as a save error — the dog already exists in the DB.
    try {
      onDogCreated(newDog);
    } catch (err) {
      logger.error(
        'onDogCreated callback threw after successful dog create',
        'dogs',
        undefined,
        err instanceof Error ? err : new Error(String(err))
      );
      notifications.warning(
        'Dog saved, but a post-save step failed. Refresh to see the latest list.'
      );
    }
  };

  const handleUseExistingDog = (dog: Dog) => {
    notifications.success(`${dog.callName || dog.name} selected`, {
      description: 'Add the new registry number from the dog profile if needed.',
    });
    try {
      onDogCreated(dog);
      onClose();
    } catch (err) {
      logger.error(
        'onDogCreated callback threw after selecting an existing dog',
        'dogs',
        undefined,
        err instanceof Error ? err : new Error(String(err))
      );
      notifications.warning('Existing dog selected, but a post-select step failed.');
    }
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
      variant={variant}
    >
      <AddDogPanelContent
        open={open}
        userRole={userRole}
        currentUserPersonId={currentUserPersonId}
        saveError={localSaveError ?? saveError}
        duplicateCandidate={duplicateCandidate}
        onUseExistingDog={handleUseExistingDog}
        onCreateSeparateDog={() => {
          setAllowSeparateDog(true);
          setDuplicateCandidate(null);
        }}
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
  duplicateCandidate: DogIdentityCandidate | null;
  onUseExistingDog: (dog: Dog) => void;
  onCreateSeparateDog: () => void;
}

const AddDogPanelContent: React.FC<AddDogPanelContentProps> = ({
  open,
  userRole,
  currentUserPersonId,
  saveError,
  duplicateCandidate,
  onUseExistingDog,
  onCreateSeparateDog,
}) => {
  const { form } = useEditPanel<DogFormData>();

  // The hook needs form to manage registrations/photos via context
  const uiState = useAddDogForm({ open, form });

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
  const ownerIdValue = form?.data.ownerId;
  const setFormValue = form?.setValue;
  useEffect(() => {
    if (currentUserPersonId && setFormValue && !ownerIdValue) {
      setFormValue('ownerId', currentUserPersonId);
    }
  }, [currentUserPersonId, setFormValue, ownerIdValue]);

  // Reset form when panel re-opens
  const [prevOpen, setPrevOpen] = React.useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open && form) {
      form.reset({
        ...createInitialFormData(),
        ownerId: currentUserPersonId || '',
      });
    }
  }

  if (!form) return null;

  const formData = form.data;

  // Tab validity for navigation indicators. The Optional tab has no required
  // fields, so it carries no completion indicator (4.E).
  const isBasicValid = isTabValid('basic', formData);
  const hasRegistrations = formData.registrations.length > 0;
  const isRegistrationValid = isTabValid('registration', formData);

  return (
    <>
      <div className="space-y-8">
        {/* Error Display */}
        {saveError && (
          <Alert className="border-destructive/30 bg-destructive/10 ">
            <AlertCircle className="h-4 w-4 text-destructive " />
            <AlertDescription className="text-destructive ">{saveError}</AlertDescription>
          </Alert>
        )}

        {duplicateCandidate && (
          <Alert className="border-amber-300 bg-amber-50 text-amber-950">
            <AlertCircle className="h-4 w-4 text-amber-700" />
            <AlertDescription>
              <div className="space-y-3">
                <p>
                  This looks like {duplicateCandidate.dog.callName || duplicateCandidate.dog.name},
                  already saved for this owner.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => onUseExistingDog(duplicateCandidate.dog)}>
                    Use existing dog
                  </Button>
                  <Button size="sm" variant="outline" onClick={onCreateSeparateDog}>
                    Create separate dog
                  </Button>
                </div>
              </div>
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
            hasRegistrations={hasRegistrations}
            isRegistrationValid={isRegistrationValid}
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

      {/* Registration slide-over. The wizard's dog isn't persisted yet, so this
          writes to wizard state (handleSaveRegistration), not the DB — do not
          swap it for AddRegistrationPanel's DB mutation path. Wrapped with an
          explicit z-index above the wizard's own SlideOverPanel (z-50) so it
          layers correctly on top even though both are position:fixed. */}
      <div className="relative z-[60]">
        <AddEditRegistrationDialog
          open={isAddEditRegDialogOpen}
          onOpenChange={setIsAddEditRegDialogOpen}
          onSave={handleSaveRegistration}
          initialData={currentRegToEdit}
        />
      </div>
    </>
  );
};
