import { useState } from 'react';
import { Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AddDogPanel } from '@/components/panels/edit';
import { useAuthContext, getPrimaryRole } from '@/hooks/useAuthContext';
import { useCurrentUserPersonId } from '@/hooks/useRoleBasedData';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import type { Dog } from '@/types/dog-types';
import { useCreatedInSession } from './CreatedInSessionContext';

/**
 * MYK9-1973: the exhibitor has no dogs yet. "register a dog" opens the wizard's
 * own Add-dog panel (the one the dog step opens), so nothing leaves the wizard.
 * Once the dog exists the wizard's auto-select picks it up; the roster is
 * re-read here so it appears without a reload.
 */
export function NoDogsYetAlert({
  showStartDate,
  createdFromShowId,
  defaultRegistryId,
  offlineFirst = false,
}: {
  showStartDate: string | undefined;
  createdFromShowId: string;
  /** The show's registry, so the first dog is registered there (as the dog step does). */
  defaultRegistryId: string | null;
  /** Staff walk-in entry creates the dog on the device first, as the dog step does. */
  offlineFirst?: boolean;
}) {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const { refetch } = useDogStoreCompat();
  const { getUserRoles } = useAuthContext();
  const currentUserPersonId = useCurrentUserPersonId();
  const createdInSession = useCreatedInSession();
  // As the dog step does: a new dog is remembered so the leave prompt can list it.
  const handleDogCreated = (dog: Dog, options?: { existing?: boolean }) => {
    if (!options?.existing) createdInSession?.recordDogCreated(dog);
    refetch();
  };

  return (
    <>
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          No dogs registered yet. Please{' '}
          <button
            type="button"
            className="underline font-medium text-primary"
            onClick={() => setIsPanelOpen(true)}
          >
            register a dog
          </button>{' '}
          before entering a show.
        </AlertDescription>
      </Alert>
      <AddDogPanel
        showStartDate={showStartDate}
        createdFromShowId={createdFromShowId}
        defaultRegistryId={defaultRegistryId}
        offlineFirst={offlineFirst}
        open={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
        onDogCreated={handleDogCreated}
        userRole={getPrimaryRole(getUserRoles())}
        currentUserPersonId={currentUserPersonId || undefined}
      />
    </>
  );
}
