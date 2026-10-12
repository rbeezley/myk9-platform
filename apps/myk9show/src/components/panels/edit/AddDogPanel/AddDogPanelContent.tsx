import React, { useEffect, type MutableRefObject } from 'react';
import { useEditPanel } from '../useEditPanel';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';
import PhotoDialog from '@/components/common/PhotoDialog';
import { AddEditRegistrationDialog } from '@/components/dogs/AddEditRegistrationDialog';
import type { Dog, Registration } from '@/types/dog-types';
import { UserRole } from '@/types/auth-types';
import { cn } from '@/lib/utils';
import type { DogFormData, TabValue } from './types';
import { createInitialFormData } from './types';
import { isTabValid } from './validation';
import { useAddDogForm } from './useAddDogForm';
import { TabNavigation } from './TabNavigation';
import { BasicInfoTab } from './BasicInfoTab';
import { RegistrationTab } from './RegistrationTab';
import { AdditionalInfoTab } from './AdditionalInfoTab';
import type { DogIdentityCandidate } from '@/utils/dogIdentity';

/** Inner component rendered within EditPanelWrapper so it can access useEditPanel context */
interface AddDogPanelContentProps {
  open: boolean;
  activeTab: TabValue;
  onActiveTabChange: (tab: TabValue) => void;
  userRole: UserRole;
  currentUserPersonId?: string | undefined;
  showStartDate?: string | undefined;
  saveError: string | null;
  duplicateCandidate: DogIdentityCandidate | null;
  onUseExistingDog: (dog: Dog) => void;
  onCreateSeparateDog: () => void;
  /**
   * Inline Add Dog (MYK9-1081): set both. The session renders the registration
   * form in place of this one, so Add / Edit hand off to `onOpenRegistration`,
   * and its save comes back through `saveRegistrationRef` because the form
   * state lives in this context. Inline also drops the photo dialog (D4).
   */
  onOpenRegistration?: ((registration: Registration | undefined) => void) | undefined;
  saveRegistrationRef?: MutableRefObject<((registration: Registration) => void) | null> | undefined;
}

export const AddDogPanelContent: React.FC<AddDogPanelContentProps> = ({
  open,
  activeTab,
  onActiveTabChange,
  userRole,
  currentUserPersonId,
  showStartDate,
  saveError,
  duplicateCandidate,
  onUseExistingDog,
  onCreateSeparateDog,
  onOpenRegistration,
  saveRegistrationRef,
}) => {
  const { form, runSelfNavigation, requestTab } = useEditPanel<DogFormData>();
  const inline = !!onOpenRegistration;

  // The hook needs form to manage registrations/photos via context
  const uiState = useAddDogForm({ open, form, onOpenRegistration });

  const {
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

  // Inline, the registration form saves through the session; hand it this
  // render's handler, which closes over the current form state.
  useEffect(() => {
    if (!saveRegistrationRef) return;
    saveRegistrationRef.current = handleSaveRegistration;
    return () => {
      saveRegistrationRef.current = null;
    };
  }, [saveRegistrationRef, handleSaveRegistration]);

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
      {/* Inline, the host's panel body has no padding of its own (EditPanelInlineShell). */}
      <div className={cn('space-y-8', inline && 'p-6')}>
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
                  <Button
                    size="sm"
                    onClick={() =>
                      runSelfNavigation(() => onUseExistingDog(duplicateCandidate.dog))
                    }
                  >
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
          onValueChange={value =>
            requestTab ? requestTab(value) : onActiveTabChange(value as TabValue)
          }
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
              referenceDate={showStartDate}
              onPhotoOpen={() => handlePhotoDialogOpen(true)}
              onAddRegistration={openAddRegistration}
              showPhoto={!inline}
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

      {/* Photo Dialog. Not inline (MYK9-1081, D4): a dialog over the host panel
          for a routine step; the photo can be added later from the dog's profile. */}
      {!inline && (
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
      )}

      {/* Registration slide-over. The wizard's dog isn't persisted yet, so this
          writes to wizard state (handleSaveRegistration), not the DB — do not
          swap it for AddRegistrationPanel's DB mutation path. Wrapped with an
          explicit z-index above the wizard's own SlideOverPanel (z-50) so it
          layers correctly on top even though both are position:fixed. */}
      {!inline && (
        <div className="relative z-[60]">
          <AddEditRegistrationDialog
            open={isAddEditRegDialogOpen}
            onOpenChange={setIsAddEditRegDialogOpen}
            onSave={handleSaveRegistration}
            initialData={currentRegToEdit}
          />
        </div>
      )}
    </>
  );
};
