import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User, JudgeInfo } from '@/types/user-types';
// import type { Dog } from '@/types/dog-types'; // Unused import
import { getOptimalStorage } from '@/services/database/storage-adapter';
// syncService removed - using database-first approach
// import { generateId } from '@/utils/idUtils';
// import { getLastModifiedBy, getCurrentUserUUID } from '@/utils/authHelpers';
import { reportStoreError } from '@/utils/standardizedErrorHandler';
import { logger } from '@/services/LoggingService';
import { persistJudgeInfo } from './userStoreJudgeInfo';
import { redactDirectoryContacts } from './userStoreRedactContacts';
import {
  currentSignOutGeneration,
  clearRedactionPending,
  isRedactionPending,
  markDirectoryLoaded,
  mustStripContacts,
  stripPeopleContacts,
  withoutContacts,
} from './userStoreContactRedaction';

// Input types for creating/updating users
export interface UserInput {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  dogs?: string[]; // Changed to match User type - dog IDs only
  roles?: string[]; // User roles (chairman, secretary, admin, etc.)
  judgeInfo?: JudgeInfo; // Judge-specific data (qualifications, certifications, availability)
  emergencyContact?: {
    name: string;
    phone: string;
    relationship: string;
  };
}

// Backward compatibility alias
export type PersonInput = UserInput;

interface UserStore {
  users: User[];
  // Backward compatibility property
  people: User[];
  isLoading: boolean;
  error: string | null;
  /**
   * MYK9-2253: the last refresh of the directory came back short of the server's
   * count, or failed, so the saved copy may be missing people. Saved with the copy,
   * so it is still known after an offline reload; a full load clears it.
   */
  directoryIncomplete: boolean;

  // Local-First Actions
  addUser: (userData: UserInput) => Promise<User>;
  updateUser: (id: string, updates: Partial<UserInput>) => Promise<User | null>;
  getUserById: (id: string) => User | null;

  // Data Management
  setUsers: (users: User[]) => void;
  loadUsers: (options?: { includeRoleLabels?: boolean }) => Promise<void>;
  /** MYK9-2255: drop contact details from the directory, in memory and saved. True once saved. */
  redactContacts: () => Promise<boolean>;

  // Sync Status
  getSyncStatus: (id: string) => 'synced' | 'pending' | 'error' | 'conflict';

  // Legacy methods for compatibility
  addUserLegacy: (user: User) => void;
  updateUserLegacy: (user: User) => void;
  removeUser: (id: string | number) => void;

  // Legacy aliases for backward compatibility
  addPersonLegacy: (person: User) => void;
  updatePersonLegacy: (person: User) => void;
  removePerson: (id: string | number) => void;
  getPersonById: (id: string) => User | null;
  setPeople: (people: User[]) => void;
  loadPeople: () => Promise<void>;

  // Dialog and selection state
  isAddUserDialogOpen: boolean;
  setIsAddUserDialogOpen: (open: boolean) => void;
  isEditUserDialogOpen: boolean;
  setIsEditUserDialogOpen: (open: boolean) => void;

  // Legacy aliases for dialog state
  isAddPersonDialogOpen: boolean;
  setIsAddPersonDialogOpen: (open: boolean) => void;
  isEditPersonDialogOpen: boolean;
  setIsEditPersonDialogOpen: (open: boolean) => void;
  isDeleteDialogOpen: boolean;
  setIsDeleteDialogOpen: (open: boolean) => void;
  isViewDetailsDialogOpen: boolean;
  setIsViewDetailsDialogOpen: (open: boolean) => void;
  selectedUser: User | null;
  setSelectedUser: (user: User | null) => void;

  // Legacy alias
  setSelectedPerson: (person: User | null) => void;

  // Cleanup
  reset?: () => void;
}

export const useUserStore = create<UserStore>()(
  persist(
    (rawSet, get) => {
      // MYK9-2255: every directory write goes through here. From a sign-out until the
      // next successful management load, no write (add, update, revert, legacy setters,
      // an update that was in flight at sign-out) keeps contact details.
      const set = (
        partial: Partial<UserStore> | ((state: UserStore) => Partial<UserStore>)
      ): void => {
        const next = typeof partial === 'function' ? partial(get()) : partial;
        rawSet(mustStripContacts() ? withoutContacts(next) : next);
      };
      return {
        users: [],
        people: [], // Backward compatibility property
        isLoading: false,
        error: null,
        directoryIncomplete: false,

        // Database-First Implementation
        addUser: async (userData: UserInput): Promise<User> => {
          try {
            set({ isLoading: true, error: null });

            // Convert structured address to string if provided
            // const addressString = userData.address
            //   ? [userData.address.street, userData.address.city, userData.address.state, userData.address.zipCode, userData.address.country]
            //       .filter(Boolean)
            //       .join(', ')
            //   : undefined;

            // Prepare data for database insertion
            // Note: roles are managed via user_roles table (people.roles column was dropped in migration 066)
            const dbUserData = {
              first_name: userData.firstName,
              last_name: userData.lastName,
              email: userData.email || null,
              phone: userData.phone || null,
              street_address: userData.address?.street || null,
              city: userData.address?.city || null,
              state: userData.address?.state || null,
              zip_code: userData.address?.zipCode || null,
            };

            // Save to database first
            const { createUser } = await import('@/services/database/users');
            const { mapDatabaseToUser } = await import('@/services/mappers/userMappers');

            const { data: dbUser, error: dbError } = await createUser(dbUserData);

            if (dbError || !dbUser) {
              throw Object.assign(
                new Error(dbError?.message || 'Failed to create user in database'),
                dbError ?? {}
              );
            }

            const newPersonId = (dbUser as Record<string, unknown>).id as string;

            // Assign roles via user_roles table. If this fails, roll back the
            // person so callers are not told creation succeeded without access.
            if (userData.roles && userData.roles.length > 0) {
              try {
                const { rbacService } = await import('@/services/rbac');
                await Promise.all(
                  userData.roles.map(roleName =>
                    rbacService.assignRole({ userId: newPersonId, roleName })
                  )
                );
              } catch (roleError) {
                const { deleteUser } = await import('@/services/database/users');
                const { error: rollbackError } = await deleteUser(newPersonId);
                if (rollbackError) {
                  logger.error('Failed to roll back user after role assignment failure', 'store', {
                    personId: newPersonId,
                    rollbackError,
                  });
                  throw new Error(
                    `Role assignment failed and user rollback failed: ${rollbackError.message}`
                  );
                }
                throw roleError;
              }
            }

            // Persist judge-specific data (best-effort — person record is the critical entity)
            await persistJudgeInfo(newPersonId, userData.judgeInfo);

            // Map database result to User object
            const newUser = mapDatabaseToUser(dbUser as Record<string, unknown>);

            // Update store with the actual database result
            set(state => ({
              users: [...state.users, newUser],
              people: [...state.people, newUser], // Backward compatibility
              isLoading: false,
            }));

            return newUser;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to add person';
            reportStoreError('addUser', 'userStore', error, {
              userName: `${userData.firstName} ${userData.lastName}`,
            });
            set({ error: errorMessage, isLoading: false });
            throw error;
          }
        },

        updateUser: async (id: string, updates: Partial<UserInput>): Promise<User | null> => {
          try {
            set({ isLoading: true, error: null });

            const currentUser = get().users.find(u => u.id === id);
            if (!currentUser) {
              const error = `User with id ${id} not found`;
              set({ error, isLoading: false });
              return null;
            }

            // Import database functions and mappers
            const { updateUser: updateUserInDb } = await import('@/services/database/users');
            const { mapUserInputToUpdate, mapDatabaseToUser } =
              await import('@/services/mappers/userMappers');

            // Convert updates to database format
            const dbUpdates = mapUserInputToUpdate(updates);

            // Save to database first
            const { data: dbUser, error: dbError } = await updateUserInDb(id, dbUpdates);

            if (dbError || !dbUser) {
              throw Object.assign(
                new Error(dbError?.message || 'Failed to update user in database'),
                dbError ?? {}
              );
            }

            // Map database result to User object
            const updatedUser = mapDatabaseToUser(dbUser);

            // Update store with the actual database result
            set(state => ({
              users: state.users.map(u => (u.id === id ? updatedUser : u)),
              people: state.people.map(u => (u.id === id ? updatedUser : u)), // Backward compatibility
              isLoading: false,
            }));

            return updatedUser;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to update user';
            reportStoreError('updateUser', 'userStore', error, { userId: id, updates });
            set({ error: errorMessage, isLoading: false });

            // Revert optimistic update by reloading current user data
            const currentUser = get().users.find(u => u.id === id);
            if (currentUser) {
              set(state => ({
                users: state.users.map(u => (u.id === id ? currentUser : u)),
                people: state.people.map(u => (u.id === id ? currentUser : u)), // Backward compatibility
              }));
            }

            throw error;
          }
        },

        getUserById: (id: string): User | null => {
          return get().users.find(u => u.id === id) || null;
        },

        // Data Management
        setUsers: users => set({ users, people: users }),

        redactContacts: (): Promise<boolean> =>
          redactDirectoryContacts(
            useUserStore.persist,
            { users: get().users, directoryIncomplete: get().directoryIncomplete },
            users => set({ users, people: users })
          ),

        loadUsers: async (options = {}): Promise<void> => {
          // Read once the removal retry has run; a sign-out after this point voids the load.
          let generation: number | undefined;
          try {
            // A removal that failed at sign-out runs again before the directory is read.
            if (isRedactionPending()) {
              const { retryPendingPeopleRedaction } =
                await import('@/services/database/users/signOutPeopleRedaction');
              await retryPendingPeopleRedaction();
            }
            generation = currentSignOutGeneration();
            set({ isLoading: true, error: null });

            // Import here to avoid circular dependencies
            const { getAllUsers } = await import('@/services/database/users');
            const { mapDatabaseToUser } = await import('@/services/mappers/userMappers');

            const { data, error, short } = await getAllUsers(options);

            // Signed out while this load ran: it writes nothing back, contact details or flag.
            if (generation !== currentSignOutGeneration()) {
              set({ isLoading: false });
              return;
            }

            if (error) {
              throw error;
            }

            // MYK9-2253: a short load keeps the copy already saved (it may hold people
            // this read missed) and marks the directory incomplete so Add Person asks the server.
            // Map database results to User objects
            const users = data.map(mapDatabaseToUser);

            // MYK9-2253: a short load keeps a saved copy (it may hold people this read missed)
            // and marks the directory incomplete, so Add Person asks the server. A device with
            // no saved copy takes the partial rows: some people beat none.
            if (short) {
              logger.warn('People directory load came back short', 'store', { data: short });
              if (get().users.length > 0) {
                set({ directoryIncomplete: true, isLoading: false, error: null });
                return;
              }
            }

            // A management load is the one write allowed to bring contact details back,
            // and it also settles any removal still pending (it replaces the directory).
            markDirectoryLoaded(generation);
            clearRedactionPending();
            rawSet({
              users,
              // Explicitly set people for backward compatibility
              people: users,
              isLoading: false,
              error: null,
              directoryIncomplete: short !== null,
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to load users';
            logger.error('💥 Failed to load users:', 'store', {}, error as Error);
            reportStoreError('loadUsers', 'userStore', error);
            // The saved copy stays; it is no longer known to be current (MYK9-2253).
            const signedOut = generation !== undefined && generation !== currentSignOutGeneration();
            set({
              error: errorMessage,
              isLoading: false,
              ...(!signedOut && { directoryIncomplete: true }),
            });
          }
        },

        // Sync Status
        getSyncStatus: (id: string): 'synced' | 'pending' | 'error' | 'conflict' => {
          const user = get().users.find(u => u.id === id);
          return user?._syncStatus || 'synced';
        },

        // Primary methods using new terminology
        addUserLegacy: user =>
          set(state => ({
            users: [...state.users, user],
            people: [...state.people, user],
          })),
        updateUserLegacy: user =>
          set(state => ({
            users: state.users.map(u => (u.id === user.id ? user : u)),
            people: state.people.map(u => (u.id === user.id ? user : u)),
          })),
        removeUser: id =>
          set(state => ({
            users: state.users.filter(u => u.id !== id),
            people: state.people.filter(u => u.id !== id),
          })),

        // Legacy aliases for backward compatibility
        addPersonLegacy: person =>
          set(state => ({
            users: [...state.users, person],
            people: [...state.people, person],
          })),
        updatePersonLegacy: person =>
          set(state => ({
            users: state.users.map(u => (u.id === person.id ? person : u)),
            people: state.people.map(u => (u.id === person.id ? person : u)),
          })),
        removePerson: id =>
          set(state => ({
            users: state.users.filter(u => u.id !== id),
            people: state.people.filter(u => u.id !== id),
          })),
        getPersonById: (id: string): User | null => {
          return get().users.find(u => u.id === id) || null;
        },
        setPeople: people => set({ users: people, people: people }),
        loadPeople: async (): Promise<void> => {
          // Legacy people pickers need names and judge qualifications, not role
          // labels. Keep their broad preload independent of migration-backed role
          // RPCs; role-aware directory/admin queries call loadUsers directly.
          return get().loadUsers({ includeRoleLabels: false });
        },

        // Dialog and selection state using new terminology
        isAddUserDialogOpen: false,
        setIsAddUserDialogOpen: open =>
          set({ isAddUserDialogOpen: open, isAddPersonDialogOpen: open }),
        isEditUserDialogOpen: false,
        setIsEditUserDialogOpen: open =>
          set({ isEditUserDialogOpen: open, isEditPersonDialogOpen: open }),

        // Legacy aliases for dialog state — keep both properties in sync
        isAddPersonDialogOpen: false,
        setIsAddPersonDialogOpen: open =>
          set({ isAddPersonDialogOpen: open, isAddUserDialogOpen: open }),
        isEditPersonDialogOpen: false,
        setIsEditPersonDialogOpen: open =>
          set({ isEditPersonDialogOpen: open, isEditUserDialogOpen: open }),
        isDeleteDialogOpen: false,
        setIsDeleteDialogOpen: open => set({ isDeleteDialogOpen: open }),
        isViewDetailsDialogOpen: false,
        setIsViewDetailsDialogOpen: open => set({ isViewDetailsDialogOpen: open }),
        selectedUser: null,
        setSelectedUser: user => set({ selectedUser: user }),

        // Legacy alias
        setSelectedPerson: person => set({ selectedUser: person }),

        // Cleanup
        reset: () =>
          set({
            users: [],
            people: [], // Reset backward compatibility property too
            isLoading: false,
            error: null,
            directoryIncomplete: false,
            selectedUser: null,
            isAddUserDialogOpen: false,
            isEditUserDialogOpen: false,
            isAddPersonDialogOpen: false,
            isEditPersonDialogOpen: false,
            isDeleteDialogOpen: false,
            isViewDetailsDialogOpen: false,
          }),
      };
    },
    {
      name: 'myk9show-user-storage',
      storage: createJSONStorage(() => getOptimalStorage('users')),
      // Only persist the users data, not the UI state
      partialize: state => ({
        users: state.users,
        directoryIncomplete: state.directoryIncomplete,
      }),
      // Sync `people` from `users` after rehydration so the two arrays
      // are always in sync.  `people` is NOT persisted (redundant copy),
      // so without this merge it would stay as [] after rehydration while
      // `users` has the restored data — causing dropdowns that read from
      // `people` to appear empty.
      // MYK9-2255: a rehydration after a sign-out (this page, or one whose strip
      // failed) must not bring contact details back.
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<UserStore>;
        const redact = mustStripContacts();
        const users =
          redact && persisted.users ? stripPeopleContacts(persisted.users) : persisted.users;
        return {
          ...currentState,
          ...persisted,
          ...(users && { users }),
          people: users ?? currentState.users,
        };
      },
      version: 1,
      migrate: (persistedState: unknown, version: number) => {
        // Handle version migrations if needed
        if (version === 0) {
          // Convert from old format if necessary
          return persistedState;
        }
        return persistedState;
      },
    }
  )
);
