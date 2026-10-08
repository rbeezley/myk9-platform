import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Dog, User } from '@/types/dog-types';
import {
  addById,
  EMPTY_CREATED_IN_SESSION,
  toCreatedDog,
  toCreatedOwner,
  type CreatedInSession,
} from './createdInSession';

interface CreatedInSessionValue {
  created: CreatedInSession;
  recordOwnerCreated: (owner: User) => void;
  recordDogCreated: (dog: Dog) => void;
}

const CreatedInSessionContext = createContext<CreatedInSessionValue | null>(null);

/** Scopes "created in this session" to one mount of the wizard page. */
export function CreatedInSessionProvider({ children }: { children: ReactNode }) {
  const [created, setCreated] = useState<CreatedInSession>(EMPTY_CREATED_IN_SESSION);

  const recordOwnerCreated = useCallback((owner: User) => {
    setCreated(current => ({ ...current, owners: addById(current.owners, toCreatedOwner(owner)) }));
  }, []);
  const recordDogCreated = useCallback((dog: Dog) => {
    setCreated(current => ({ ...current, dogs: addById(current.dogs, toCreatedDog(dog)) }));
  }, []);

  const value = useMemo(
    () => ({ created, recordOwnerCreated, recordDogCreated }),
    [created, recordOwnerCreated, recordDogCreated]
  );
  return (
    <CreatedInSessionContext.Provider value={value}>{children}</CreatedInSessionContext.Provider>
  );
}

/** Null outside the wizard: the create dialogs are reused elsewhere and must keep working. */
// eslint-disable-next-line react-refresh/only-export-components
export function useCreatedInSession(): CreatedInSessionValue | null {
  return useContext(CreatedInSessionContext);
}
