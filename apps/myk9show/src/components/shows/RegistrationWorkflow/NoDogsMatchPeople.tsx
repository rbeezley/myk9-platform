import { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { AddDogPanel } from '@/components/panels/edit';
import { getPrimaryRole } from '@/context/authContextHelpers';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useRegistrationPermissions } from '@/hooks/useRegistrationPermissions';
import { useUserStore } from '@/store/userStore';
import type { Dog } from '@/types/dog-types';
import type { User } from '@/types/user-types';
import { matchPeopleByName, personDisplayName } from './matchPeopleByName';

interface NoDogsMatchPeopleProps {
  /** The text in the search box; nothing renders until it matches someone. */
  query: string;
  onDogCreated: (dog: Dog, options?: { existing?: boolean }) => void;
  showStartDate: string | undefined;
  createdFromShowId: string | undefined;
  defaultRegistryId: string | null | undefined;
  offlineFirst?: boolean;
}

/**
 * Under the "no dogs match" message: the people the search matches, so an owner who has no
 * dogs yet is told apart from "no match" before the duplicate prompt. Reads the saved people
 * directory the device already holds (no new download); choosing one opens the same Add Dog
 * panel the person's profile uses, with that person as the owner.
 */
export function NoDogsMatchPeople({
  query,
  onDogCreated,
  showStartDate,
  createdFromShowId,
  defaultRegistryId,
  offlineFirst = false,
}: NoDogsMatchPeopleProps) {
  const { people, loadUsers } = useUserStore();
  const { roles } = useRegistrationPermissions();
  const { refetch } = useDogStoreCompat();
  const [owner, setOwner] = useState<User | null>(null);

  // Same as the Add Person duplicate check: load the directory only when the device has none.
  useEffect(() => {
    if (people.length === 0) void loadUsers();
  }, [loadUsers, people.length]);

  const matches = matchPeopleByName(people, query);
  if (matches.length === 0 && !owner) return null;

  return (
    <>
      {matches.length > 0 && (
        <div data-testid="no-dogs-match-people" className="mx-auto mt-4 max-w-md px-4 text-left">
          <p className="text-sm font-medium">People who match</p>
          <ul className="mt-2 space-y-2">
            {matches.map(person => (
              <li key={person.id}>
                <button
                  type="button"
                  onClick={() => setOwner(person)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-md border border-border px-3 py-2 text-left hover:bg-muted"
                >
                  <UserPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    <span className="block text-sm font-medium">{personDisplayName(person)}</span>
                    <span className="block text-xs text-muted-foreground">
                      No dogs yet. Add a dog for them.
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <AddDogPanel
        open={owner !== null}
        onClose={() => setOwner(null)}
        onDogCreated={(dog, options) => {
          refetch();
          onDogCreated(dog, options);
          setOwner(null);
        }}
        userRole={getPrimaryRole(roles)}
        currentUserPersonId={owner?.id}
        showStartDate={showStartDate}
        createdFromShowId={createdFromShowId}
        defaultRegistryId={defaultRegistryId}
        offlineFirst={offlineFirst}
      />
    </>
  );
}
