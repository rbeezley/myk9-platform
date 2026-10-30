/**
 * Whether the show page will give this viewer a Results surface (MYK9-1508).
 *
 * The menu asks the show page's own rule, `resolveShowAudience`, with the same
 * inputs `ShowDetailsPage` builds for it, so the Results item is correct by
 * construction: it appears exactly when the audience is not `public` (or still
 * `pending`). MYK9-1544 changes the rule in that one place and the menu follows.
 */
import { useAuthContext } from '@/hooks/useAuthContext';
import { isAccountSession } from '@/hooks/guestServerRead';
import { useEntriesByShowQuery } from '@/hooks/queries/useEntriesDatabase';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useSubmittedEntryProjection } from '@/features/exhibitor-entry/useSubmittedEntryProjection';
import { resolveShowAudience } from '@/pages/ShowDetailsPage.audience';
import { isValidUUID } from '@/utils/validation';

export function useShowResultsAccess(showId: string | undefined, canManageShow: boolean): boolean {
  const { user, userWithRoles, rbacLoading } = useAuthContext();
  const {
    data: showEntries = [],
    isLoading,
    isError,
  } = useEntriesByShowQuery(
    showId ?? '',
    Boolean(showId && isValidUUID(showId) && isAccountSession(user))
  );
  const { dogs } = useDogStoreCompat();
  const { projection, state } = useSubmittedEntryProjection({
    entries: showEntries,
    dogs,
    databaseUserId: userWithRoles?.databaseUserId,
    isLoading,
    isError,
  });
  const audience = resolveShowAudience({
    isManagementSection: false,
    canManageShow,
    rbacLoading: Boolean(rbacLoading && !userWithRoles),
    isAuthenticated: !!user,
    userEntriesLoading: state === 'loading',
    hasUserEntries: projection.historyCount > 0,
  });
  return audience !== 'public' && audience !== 'pending';
}
