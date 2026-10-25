import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { Registration } from '@/types/dog-types';
import type { DogRegistrationIdentity } from '@/utils/dogIdentity';
import {
  RegistrationBreedVarietyFields,
  RegistrationNameField,
  RegistrationNumberField,
  RegistrationOrganizationField,
  RegistrationStatusField,
  RegistrationDateField,
} from '@/components/dogs/RegistrationFormBody';
import {
  initialRegistrationData,
  REGISTRATION_NUMBER_PATTERN,
} from '@/components/dogs/registrationForm';
import { useRegistrationEditor } from '@/components/dogs/useRegistrationEditor';
import type { RegistrationLookupResult } from './registrationLookup';

/** Shown for a number held by a dog this user cannot see. Says nothing about that dog. */
export const REGISTRATION_TAKEN_MESSAGE =
  'This number is already registered to another dog. Contact the show secretary.';

/** One of: asking for the identity, checking it, refusing it, or asking for the rest. */
type Phase = 'identity' | 'checking' | 'taken' | 'details';

interface RegistrationIdentityStepProps {
  /** Looks the identity up. A dog the user can see is offered by the host, not here. */
  onFindDog: (identity: DogRegistrationIdentity) => Promise<RegistrationLookupResult>;
  /** Called when the identity is edited, so the host can drop a stale "found" card. */
  onIdentityEdited: () => void;
  /**
   * True once something is typed here and until it is saved or the step goes away. The dog
   * form does not hold it yet, so the panel needs telling to ask before Escape drops it.
   */
  onDraftChange: (draft: boolean) => void;
  /** Next was refused while this draft is unsaved. */
  draftBlocked: boolean;
  /** Writes the dog's first registration to the unsaved dog's form state. */
  onSaveRegistration: (registration: Registration) => void;
  /** The first registration is recorded: move on to the dog's own details. */
  onRegistrationSaved: () => void;
  /** Show managers only: skip the lookup and add the dog with no registration. */
  onSkip?: (() => void) | undefined;
  /** The show's registry: the organization starts there, not on AKC (MYK9-832). */
  defaultRegistryId?: string | null | undefined;
}

/**
 * The Registration step before a dog has any registration (MYK9-1162): registry
 * and number first, then "Find dog". A dog already known is offered instead of
 * added twice; otherwise the rest of the registration is asked for in this same
 * step, so the number the user typed is the dog's first registration.
 *
 * INTENT: a number held by a dog the user cannot see (an exhibitor and someone
 * else's dog) reveals only that it is taken. No name, owner or other detail.
 */
export const RegistrationIdentityStep: React.FC<RegistrationIdentityStepProps> = ({
  onFindDog,
  onIdentityEdited,
  onDraftChange,
  draftBlocked,
  onSaveRegistration,
  onRegistrationSaved,
  onSkip,
  defaultRegistryId,
}) => {
  const editor = useRegistrationEditor({
    defaultRegistryId,
    onSave: onSaveRegistration,
    onSaved: onRegistrationSaved,
  });
  const { form, handleFieldChange, handleOrganizationChange } = editor;
  const [phase, setPhase] = useState<Phase>('identity');
  // Only the newest "Find dog" may answer; an edit while it runs retires it.
  const requestRef = useRef(0);

  // A draft is what is actually filled in, not "was ever edited": clearing the fields, or the
  // skip below, leaves nothing for Save to refuse over.
  const { data } = form;
  // A registry picked with nothing else entered loses nothing if dropped, so it is not one.
  const hasDraft = Boolean(
    data.registrationNumber.trim() || data.registeredName.trim() || data.breed
  );
  useEffect(() => {
    onDraftChange(hasDraft);
  }, [hasDraft, onDraftChange]);
  useEffect(() => () => onDraftChange(false), [onDraftChange]);

  const identityEdited = () => {
    requestRef.current += 1;
    setPhase('identity');
    onIdentityEdited();
  };

  // The explicit way on without a registration: whatever was typed here is dropped, so it can
  // neither linger on this (still mounted) step nor hold Save back later.
  const skip = () => {
    requestRef.current += 1;
    form.reset(initialRegistrationData(defaultRegistryId));
    setPhase('identity');
    onIdentityEdited();
    onSkip?.();
  };

  const findDog = async () => {
    if (phase === 'checking') return;
    const organization = form.data.organization;
    const registrationNumber = form.data.registrationNumber.trim();
    form.touchField('organization');
    form.touchField('registrationNumber');
    if (!organization || !REGISTRATION_NUMBER_PATTERN.test(registrationNumber)) return;
    if (registrationNumber !== form.data.registrationNumber) {
      handleFieldChange('registrationNumber', registrationNumber);
    }
    const request = ++requestRef.current;
    onIdentityEdited();
    setPhase('checking');
    const result = await onFindDog({ organization, registrationNumber });
    if (request !== requestRef.current) return;
    setPhase(result.kind === 'free' ? 'details' : result.kind === 'taken' ? 'taken' : 'identity');
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Start with the registration number. If this dog is already in myK9Show, you can use it
        instead of adding it again.
      </p>
      <RegistrationOrganizationField
        editor={editor}
        onChange={organization => {
          handleOrganizationChange(organization);
          identityEdited();
        }}
      />
      <RegistrationNumberField
        editor={editor}
        onChange={number => {
          handleFieldChange('registrationNumber', number);
          identityEdited();
        }}
        onEnter={phase === 'details' ? undefined : findDog}
      />

      {draftBlocked && (
        <p role="alert" className="text-sm text-destructive">
          {onSkip
            ? 'Save this registration before adding the dog, or choose "No registration number yet".'
            : 'Save this registration before adding the dog.'}
        </p>
      )}

      {phase === 'taken' && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-950">
          <AlertCircle className="h-4 w-4 text-amber-700" />
          <AlertDescription>{REGISTRATION_TAKEN_MESSAGE}</AlertDescription>
        </Alert>
      )}

      {phase === 'details' ? (
        <>
          <RegistrationNameField editor={editor} />
          <RegistrationBreedVarietyFields editor={editor} />
          <RegistrationStatusField editor={editor} />
          <RegistrationDateField editor={editor} />
        </>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        {phase === 'details' ? (
          <Button
            type="button"
            onClick={editor.handleSubmit}
            disabled={editor.isSaving}
            aria-busy={editor.isSaving}
          >
            Save and continue
          </Button>
        ) : (
          <Button
            type="button"
            onClick={findDog}
            disabled={phase === 'checking'}
            aria-busy={phase === 'checking'}
          >
            Find dog
          </Button>
        )}
        {/* Offered in every phase: the message that refuses a half-typed registration names it. */}
        {onSkip && (
          <Button type="button" variant="link" size="touch" onClick={skip}>
            No registration number yet
          </Button>
        )}
      </div>
    </div>
  );
};
