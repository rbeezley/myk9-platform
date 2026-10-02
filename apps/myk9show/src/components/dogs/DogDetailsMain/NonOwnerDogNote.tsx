import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useCurrentValidatedClubContext } from '@/hooks/useValidatedClubContext';
import { UserRole } from '@/types/auth-types';
import { useShowStore } from '@/store/showStore';
import { filterManagedShows, managedClubIds } from '@/utils/roleScopes';

const SECRETARY_SHOWS_PATH = '/secretary/dashboard';

/**
 * MYK9-935: a secretary looking at someone else's dog sees only Registrations
 * and Health Records, on purpose. Entries and results live with each show, so
 * say where, instead of rebuilding them here.
 *
 * A secretary with one managed show goes straight to its Entries page; zero or
 * several go to the secretary dashboard (the /secretary/* guard admits the
 * secretary role). A club admin without the secretary role cannot open that
 * guard, so they get the sidebar's "Our Shows" target, /shows?club=<clubId>,
 * from the same validated club context, or /shows until it is ready.
 */
const NonOwnerDogNote: React.FC = () => {
  const { isAdmin, userWithRoles, hasRole } = useAuthContext();
  const clubContext = useCurrentValidatedClubContext();
  const shows = useShowStore(state => state.shows);
  const isSecretary = hasRole(UserRole.SECRETARY);
  const clubId = clubContext.status === 'ready' ? clubContext.clubId : null;
  const href = useMemo(() => {
    if (!isSecretary) return clubId ? `/shows?club=${clubId}` : '/shows';
    const managed = filterManagedShows(shows, managedClubIds({ isAdmin, userWithRoles }));
    return managed.length === 1 ? `/shows/${managed[0].id}/entries` : SECRETARY_SHOWS_PATH;
  }, [isSecretary, clubId, shows, isAdmin, userWithRoles]);

  return (
    <Alert role="note" data-testid="non-owner-dog-note">
      <Info className="h-4 w-4" aria-hidden="true" />
      <AlertTitle>Entries and results live with each show.</AlertTitle>
      <AlertDescription>
        <p>
          This page shows the dog&apos;s registration and health records. To see what this dog is
          entered in, open the show&apos;s Entries page and search for the dog&apos;s name.
        </p>
        <Link
          to={href}
          className="mt-2 inline-block font-medium text-primary underline-offset-4 hover:underline"
        >
          Go to my shows →
        </Link>
      </AlertDescription>
    </Alert>
  );
};

export default NonOwnerDogNote;
