import React, { useRef, useState } from 'react';
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
} from '@/components/dogs/RegistrationFormBody';
import {
  REGISTRATION_NUMBER_PATTERN,
  useRegistrationEditor,
} from '@/components/dogs/useRegistrationEditor';
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
  /** Writes the dog's first registration to the unsaved dog's form state. */
  onSaveRegistration: (registration: Registration) => void;
  /** The first registration is recorded: move on to the dog's own details. */
  onRegistrationSaved: () => void;
  /** Show managers only: skip the lookup and add the dog with no registration. */
  onSkip?: (() => void) | undefined;
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
  onSaveRegistration,
  onRegistrationSaved,
  onSkip,
}) => {
  const editor = useRegistrationEditor({
    open: true,
    onSave: onSaveRegistration,
    onSaved: onRegistrationSaved,
  });
  const { form, handleFieldChange, handleOrganizationChange } = editor;
  const [phase, setPhase] = useState<Phase>('identity');
  // Only the newest "Find dog" may answer; an edit while it runs retires it.
  const requestRef = useRef(0);

  const identityEdited = () => {
    requestRef.current += 1;
    setPhase('identity');
    onIdentityEdited();
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
          <Button
            type="button"
            onClick={editor.handleSubmit}
            disabled={editor.isSaving}
            aria-busy={editor.isSaving}
          >
            Save and continue
          </Button>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={findDog}
            disabled={phase === 'checking'}
            aria-busy={phase === 'checking'}
          >
            Find dog
          </Button>
          {onSkip && (
            <Button type="button" variant="link" size="sm" onClick={onSkip}>
              No registration number yet
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
