import React, { useEffect, type MutableRefObject } from 'react';
import { useEditPanel } from '../useEditPanel';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import PhotoDialog from '@/components/common/PhotoDialog';
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
import type { DogIdentityCandidate, DogRegistrationIdentity } from '@/utils/dogIdentity';
import { isAdminRole } from '../DogEditPanel.helpers';
import { DuplicateDogAlert } from './DuplicateDogAlert';
import type { RegistrationLookupResult } from './registrationLookup';

/** Inner component rendered within EditPanelWrapper so it can access useEditPanel context */
interface AddDogPanelContentProps {
  open: boolean;
  activeTab: TabValue;
  onActiveTabChange: (tab: TabValue) => void;
  userRole: UserRole;
  currentUserPersonId?: string | undefined;
  showStartDate?: string | undefined;
  defaultRegistryId?: string | null | undefined;
  saveError: string | null;
  duplicateCandidate: DogIdentityCandidate | null;
  /** A dog the Registration step's "Find dog" matched by number (MYK9-1162). */
  registrationMatch: Dog | null;
  onFindDog: (identity: DogRegistrationIdentity) => Promise<RegistrationLookupResult>;
  /** The identity being typed changed, so a "found" card for the old one is stale. */
  onIdentityEdited: () => void;
  onIdentityDraftChange: (draft: boolean) => void;
  /** Next was refused because a registration is typed but not saved. */
  draftBlocked: boolean;
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
  /** Keeps the photo control inline (MYK9-1116); defaults to off inline, on otherwise. */
  showPhoto?: boolean | undefined;
}

export const AddDogPanelContent: React.FC<AddDogPanelContentProps> = ({
  open,
  activeTab,
  onActiveTabChange,
  userRole,
  currentUserPersonId,
  showStartDate,
  defaultRegistryId,
  saveError,
  duplicateCandidate,
  registrationMatch,
  onFindDog,
  onIdentityEdited,
  onIdentityDraftChange,
  draftBlocked,
  onUseExistingDog,
  onCreateSeparateDog,
  onOpenRegistration,
  saveRegistrationRef,
  showPhoto = !onOpenRegistration,
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

  // Leaving the Registration step unmounts the control that had focus; hand it to Call Name
  // once Essential has mounted, so keyboard and screen-reader users land on the next field.
  const focusCallNameRef = React.useRef(false);
  useEffect(() => {
    if (activeTab !== 'basic' || !focusCallNameRef.current) return;
    focusCallNameRef.current = false;
    document.getElementById('callName')?.focus();
  }, [activeTab, form]);
  const goToEssential = () => {
    focusCallNameRef.current = true;
    onActiveTabChange('basic');
  };

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

        {registrationMatch && (
          <DuplicateDogAlert
            dog={registrationMatch}
            reason="already saved with this registration number"
            onUseExistingDog={() => runSelfNavigation(() => onUseExistingDog(registrationMatch))}
          />
        )}

        {duplicateCandidate && (
          <DuplicateDogAlert
            dog={duplicateCandidate.dog}
            reason="already saved for this owner"
            onUseExistingDog={() =>
              runSelfNavigation(() => onUseExistingDog(duplicateCandidate.dog))
            }
            onCreateSeparateDog={onCreateSeparateDog}
          />
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
            compact={inline}
          />

          {/* keepMounted: a registration typed here but not yet saved survives a move to another
              step, including the gate's redirect when an earlier step is invalid (MYK9-1162). */}
          <TabsContent value="registration" keepMounted className="space-y-8 mt-8">
            <RegistrationTab
              onRemoveRegistration={handleRemoveRegistration}
              onEditRegistration={openEditRegistration}
              onAddRegistration={openAddRegistration}
              onFindDog={onFindDog}
              onIdentityEdited={onIdentityEdited}
              onIdentityDraftChange={onIdentityDraftChange}
              draftBlocked={draftBlocked}
              onSaveRegistration={handleSaveRegistration}
              onRegistrationSaved={goToEssential}
              onSkip={isAdminRole(userRole) ? goToEssential : undefined}
              defaultRegistryId={defaultRegistryId}
              flat={inline}
            />
          </TabsContent>

          <TabsContent
            value="basic"
            className="space-y-8 mt-8 animate-in slide-in-from-bottom-2 duration-500 ease-apple"
          >
            <BasicInfoTab
              userRole={userRole}
              currentUserPersonId={currentUserPersonId}
              referenceDate={showStartDate}
              onPhotoOpen={() => handlePhotoDialogOpen(true)}
              showPhoto={showPhoto}
              flat={inline}
            />
          </TabsContent>

          <TabsContent value="optional" className="space-y-8 mt-8">
            <AdditionalInfoTab flat={inline} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Photo Dialog. Off in Quick Create (MYK9-1081, D4): a dialog over its host
          panel for a routine step; the photo can be added later from the profile. */}
      {showPhoto && (
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
    </>
  );
};
