import { useState } from 'react';
import { Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AddDogPanel } from '@/components/panels/edit';
import { useAuthContext, getPrimaryRole } from '@/hooks/useAuthContext';
import { useCurrentUserPersonId } from '@/hooks/useRoleBasedData';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';

/**
 * MYK9-1973: the exhibitor has no dogs yet. "register a dog" opens the wizard's
 * own Add-dog panel (the one the dog step opens), so nothing leaves the wizard.
 * Once the dog exists the wizard's auto-select picks it up; the roster is
 * re-read here so it appears without a reload.
 */
export function NoDogsYetAlert({
  showStartDate,
  createdFromShowId,
}: {
  showStartDate: string | undefined;
  createdFromShowId: string;
}) {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const { refetch } = useDogStoreCompat();
  const { getUserRoles } = useAuthContext();
  const currentUserPersonId = useCurrentUserPersonId();

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
        open={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
        onDogCreated={() => refetch()}
        userRole={getPrimaryRole(getUserRoles())}
        currentUserPersonId={currentUserPersonId || undefined}
      />
    </>
  );
}
