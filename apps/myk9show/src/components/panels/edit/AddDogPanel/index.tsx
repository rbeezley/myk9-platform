import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditPanelWrapper, type EditPanelSaveContext } from '../EditPanelWrapper';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { DogInput } from '@/store/dogStore';
import type { Dog, Registration } from '@/types/dog-types';
import { UserRole } from '@/types/auth-types';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import { friendlySaveMessage } from '@/utils/friendlySaveError';
import { PanelSaveHandledError } from '../panelSaveErrors';
import type { AddDogPanelProps, AddDogSubMode, DogFormData } from './types';
import { createInitialFormData } from './types';
import { addDogSchema } from './validation';
import {
  locateInvalidField,
  DOG_STEP_TABS,
  ADD_REGISTRATION_ATTR,
  EDIT_REGISTRATION_ATTR,
} from './validationTab';
import { usePanelValidationNavigation } from '../usePanelValidationNavigation';
import type { TabValue } from './types';
import { buildDogSavedToast } from './dogSavedToast';
import { AddDogPanelContent } from './AddDogPanelContent';
import { RegistrationFormInline } from './RegistrationFormInline';
import { usePanelModeFocus } from '../../usePanelModeFocus';
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
  showStartDate,
  createdFromShowId,
  closeRequestRef,
  onSubModeChange,
}) => {
  const { addDog, addDogOfflineFirst, dogs, error: saveError } = useDogStoreCompat();
  const [localSaveError, setLocalSaveError] = useState<string | null>(null);
  const [duplicateCandidate, setDuplicateCandidate] = useState<DogIdentityCandidate | null>(null);
  const [allowSeparateDog, setAllowSeparateDog] = useState(false);
  // Lives here (not in the content) so a failed Save can move the user to the
  // tab holding the first invalid field (MYK9-885).
  const { activeTab, setActiveTab, handleValidationFail } = usePanelValidationNavigation<TabValue>(
    'basic',
    locateInvalidField
  );

  // Stable initial data — recalculated when currentUserPersonId changes.
  // INTENT: when the panel opens with a contextual person (e.g. secretary
  // clicking "Add Dog" from a Person profile), pre-fill the owner so they
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
  const handleSave = async (formData: DogFormData, { runSelfNavigation }: EditPanelSaveContext) => {
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
        // The duplicate card in the panel body already explains this; the wrapper
        // keeps the form open without a failure toast (M18).
        throw new PanelSaveHandledError();
      }
    }

    const weight = formData.weight ? parseFloat(formData.weight) : undefined;
    const height = formData.height ? parseFloat(formData.height) : undefined;
    const dogInput: DogInput = {
      // Legacy `dogs.name` is still NOT NULL in some deployed schemas. The
      // write mapper deliberately does not persist this field; keep the call
      // name here only so legacy create paths can satisfy that constraint.
      // It is not a registered name — organization-scoped names live on the
      // registration rows below.
      name: formData.callName,
      callName: formData.callName,
      // Keep the legacy NOT NULL column satisfiable, but never read this
      // placeholder as a breed; display and paperwork resolve registrations.
      breed: formData.registrations?.[0]?.breed || '',
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
      const creation = { ...(createdFromShowId && { createdFromShowId }) };
      newDog = offlineFirst
        ? await addDogOfflineFirst(dogInput, {
            ...(offlineDependsOn && offlineDependsOn.length > 0 && { dependsOn: offlineDependsOn }),
            ...creation,
          })
        : await addDog(dogInput, creation);
    } catch (error) {
      setLocalSaveError(friendlySaveMessage(error));
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
      // The parent routes to the new dog. Suppress the route guard for exactly
      // that call: the form is still dirty, but the work is saved (MYK9-165).
      runSelfNavigation(() => onDogCreated(newDog));
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
      onDogCreated(dog, { existing: true });
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

  // --- Inline only (MYK9-1081): the registration form is a sub-mode of this
  // panel's host, shown in place of the dog form. The dog form stays mounted
  // (hidden and inert) so its values and active tab survive the round trip.
  const inline = variant === 'inline';
  const [registration, setRegistration] = useState<{ editing?: Registration } | null>(null);
  const subMode: AddDogSubMode = !registration
    ? 'dog'
    : registration.editing
      ? 'registration-edit'
      : 'registration-add';
  const saveRegistrationRef = useRef<((registration: Registration) => void) | null>(null);
  const dogCloseRef = useRef<(() => void) | null>(null);
  const dogFormRef = useRef<HTMLDivElement>(null);
  const registrationFormRef = useRef<HTMLDivElement>(null);
  const lastEditedIdRef = useRef<string | null>(null);

  const openRegistration = useCallback(
    (editing: Registration | undefined) => {
      lastEditedIdRef.current = editing?.id ?? null;
      setRegistration(editing ? { editing } : {});
      onSubModeChange?.(editing ? 'registration-edit' : 'registration-add');
    },
    [onSubModeChange]
  );
  const leaveRegistration = useCallback(() => {
    setRegistration(null);
    onSubModeChange?.('dog');
  }, [onSubModeChange]);

  // The host's Back / Escape / X: leave the sub-mode, else the dog form's own
  // close request (the discard prompt when dirty).
  const inSubMode = registration !== null;
  useEffect(() => {
    if (!closeRequestRef) return;
    closeRequestRef.current = () => (inSubMode ? leaveRegistration() : dogCloseRef.current?.());
    return () => {
      closeRequestRef.current = null;
    };
  }, [closeRequestRef, inSubMode, leaveRegistration]);

  const registrationReturnTarget = useCallback((left: AddDogSubMode) => {
    const dogForm = dogFormRef.current;
    const editedId = lastEditedIdRef.current;
    const target =
      left === 'registration-edit' && editedId
        ? dogForm?.querySelector<HTMLElement>(
            `[${EDIT_REGISTRATION_ATTR}="${CSS.escape(editedId)}"]`
          )
        : dogForm?.querySelector<HTMLElement>(`[${ADD_REGISTRATION_ATTR}]`);
    return target ?? dogForm;
  }, []);
  usePanelModeFocus({
    mode: subMode,
    home: 'dog',
    formRef: registrationFormRef,
    returnTarget: registrationReturnTarget,
    enabled: inline,
  });

  const dogForm = (
    <EditPanelWrapper<DogFormData>
      open={open}
      onClose={onClose}
      title="Add Dog"
      initialData={initialFormData}
      schema={addDogSchema}
      onSave={handleSave}
      forceHasChanges
      size="xl"
      saveLabel="Add Dog"
      enableAutoSave={false}
      showUnsavedWarning={true}
      variant={variant}
      {...(inline && { closeRequestRef: dogCloseRef })}
      onValidationFail={handleValidationFail}
      steps={{
        mode: 'create',
        tabs: DOG_STEP_TABS,
        activeTab,
        onTabChange: tab => setActiveTab(tab as TabValue),
        locate: locateInvalidField,
      }}
    >
      <AddDogPanelContent
        open={open}
        activeTab={activeTab}
        onActiveTabChange={setActiveTab}
        userRole={userRole}
        showStartDate={showStartDate}
        currentUserPersonId={currentUserPersonId}
        saveError={localSaveError ?? saveError}
        duplicateCandidate={duplicateCandidate}
        onUseExistingDog={handleUseExistingDog}
        onCreateSeparateDog={() => {
          setAllowSeparateDog(true);
          setDuplicateCandidate(null);
        }}
        {...(inline && {
          onOpenRegistration: openRegistration,
          saveRegistrationRef,
        })}
      />
    </EditPanelWrapper>
  );

  if (!inline) return dogForm;

  return (
    <>
      <div
        ref={dogFormRef}
        tabIndex={-1}
        hidden={inSubMode}
        inert={inSubMode}
        className="h-full outline-none"
      >
        {dogForm}
      </div>
      {registration && (
        <div ref={registrationFormRef} tabIndex={-1} className="h-full outline-none">
          <RegistrationFormInline
            initialData={registration.editing}
            onSave={reg => saveRegistrationRef.current?.(reg)}
            onDone={leaveRegistration}
          />
        </div>
      )}
    </>
  );
};
