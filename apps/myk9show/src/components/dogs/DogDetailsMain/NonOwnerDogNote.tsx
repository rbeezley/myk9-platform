import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useShowStore } from '@/store/showStore';
import { filterManagedShows, managedClubIds } from '@/utils/roleScopes';

const SHOWS_LIST_PATH = '/secretary/dashboard';

/**
 * MYK9-935: a secretary looking at someone else's dog sees only Registrations
 * and Health Records, on purpose. Entries and results live with each show, so
 * say where, instead of rebuilding them here.
 *
 * One managed show goes straight to its Entries page; zero or several go to the
 * shows list. The managed set comes from the same store and scope filter the
 * sidebar uses, so no extra read runs in this flow.
 */
const NonOwnerDogNote: React.FC = () => {
  const { isAdmin, userWithRoles } = useAuthContext();
  const shows = useShowStore(state => state.shows);
  const href = useMemo(() => {
    const managed = filterManagedShows(shows, managedClubIds({ isAdmin, userWithRoles }));
    return managed.length === 1 ? `/shows/${managed[0].id}/entries` : SHOWS_LIST_PATH;
  }, [shows, isAdmin, userWithRoles]);

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
