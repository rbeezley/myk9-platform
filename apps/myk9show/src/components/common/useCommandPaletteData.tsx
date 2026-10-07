import { useMemo, startTransition } from 'react';
import { Dog, Users, Calendar, Building } from 'lucide-react';
import type { NavigateFunction } from 'react-router-dom';
import { useDogsQuery } from '@/hooks/queries/useDogsDatabase';
import { mapDatabaseDogsArray } from '@/services/mappers/dogMappers';
import { useUserStore } from '@/store/userStore';
import { useShowStore } from '@/store/showStore';
import { useClubStore } from '@/store/clubStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useDirectoryViewer } from '@/hooks/useDirectoryViewer';
import { filterVisibleBrowseClubs } from '@/hooks/browseClubsVisibility';
import { getDogBreedLabel, getDogDisplayName } from '@/types/dog-types';
import type { CommandAction } from '@/features/command-menu/commandPaletteAdapter';

export function useCommandPaletteData(
  canBrowsePeople: boolean,
  navigate: NavigateFunction,
  onOpenChange: (open: boolean) => void
): CommandAction[] {
  // The legacy dog UI store no longer holds records. Use the role-scoped
  // replication-backed query that supplies the Dogs page.
  const { data: dogRows } = useDogsQuery();
  const dogs = useMemo(() => (dogRows ? mapDatabaseDogsArray(dogRows) : []), [dogRows]);
  const people = useUserStore(state => state.people);
  const shows = useShowStore(state => state.shows);
  const replicaClubs = useClubStore(state => state.clubs);
  const { userWithRoles } = useAuthContext();
  const { isSignedIn } = useDirectoryViewer();
  const roles = userWithRoles?.roles;
  // Match the directory: guests/passcode sessions never read cached clubs;
  // developer seed clubs are visible only to site admins.
  const clubs = useMemo(
    () => (isSignedIn ? filterVisibleBrowseClubs(replicaClubs, roles) : []),
    [isSignedIn, replicaClubs, roles]
  );

  // Build all data commands from full dataset, then let cmdk filter + we slice display
  return useMemo(() => {
    const commands: CommandAction[] = [];

    for (const dog of dogs) {
      commands.push({
        id: `dog-${dog.id}`,
        title: getDogDisplayName(dog),
        subtitle: `${getDogBreedLabel(dog)} · Go to dog profile`,
        icon: <Dog className="h-4 w-4" />,
        action: () =>
          startTransition(() => {
            navigate(`/dogs/${dog.id}`);
            onOpenChange(false);
          }),
        keywords: [dog.name, dog.callName, getDogBreedLabel(dog)].filter(Boolean) as string[],
        category: 'data',
      });
    }

    if (canBrowsePeople) {
      for (const person of people) {
        const name = `${person.firstName} ${person.lastName}`;
        commands.push({
          id: `person-${person.id}`,
          title: name,
          subtitle: 'Go to person profile',
          icon: <Users className="h-4 w-4" />,
          action: () =>
            startTransition(() => {
              navigate(`/people/${person.id}`);
              onOpenChange(false);
            }),
          keywords: [person.firstName, person.lastName, name],
          category: 'data',
        });
      }
    }

    for (const show of shows) {
      commands.push({
        id: `show-${show.id}`,
        title: show.name,
        subtitle: `${show.location} · Go to show`,
        icon: <Calendar className="h-4 w-4" />,
        action: () =>
          startTransition(() => {
            navigate(`/shows/${show.id}`);
            onOpenChange(false);
          }),
        keywords: [show.name, show.location, show.organization],
        category: 'data',
      });
    }

    for (const club of clubs) {
      commands.push({
        id: `club-${club.id}`,
        title: club.name,
        subtitle: 'Go to club profile',
        icon: <Building className="h-4 w-4" />,
        action: () =>
          startTransition(() => {
            navigate(`/clubs/${club.id}`);
            onOpenChange(false);
          }),
        keywords: [club.name],
        category: 'data',
      });
    }

    return commands;
  }, [canBrowsePeople, dogs, people, shows, clubs, navigate, onOpenChange]);
}
