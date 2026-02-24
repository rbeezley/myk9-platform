import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User } from '@/types/user-types';
// import type { Dog } from '@/types/dog-types'; // Unused import
import { getOptimalStorage } from '@/services/database/storage-adapter';
// syncService removed - using database-first approach
// import { generateId } from '@/utils/idUtils';
// import { getLastModifiedBy, getCurrentUserUUID } from '@/utils/authHelpers';
import { reportStoreError } from '@/utils/standardizedErrorHandler';
import { logger } from '@/services/LoggingService';

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
  dogs?: string[];  // Changed to match User type - dog IDs only
  roles?: string[]; // User roles (chairman, secretary, admin, etc.)
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
  
  // Local-First Actions
  addUser: (userData: UserInput) => Promise<User>;
  updateUser: (id: string, updates: Partial<UserInput>) => Promise<User | null>;
  deleteUser: (id: string) => Promise<void>;
  getUserById: (id: string) => User | null;
  
  // Data Management
  setUsers: (users: User[]) => void;
  loadUsers: () => Promise<void>;
  
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
    (set, get) => ({
      users: [],
      people: [], // Backward compatibility property
      isLoading: false,
      error: null,
      
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
          const dbUserData = {
            first_name: userData.firstName,
            last_name: userData.lastName,
            email: userData.email || null,
            phone: userData.phone || null,
            street_address: userData.address?.street || null,
            city: userData.address?.city || null,
            state: userData.address?.state || null,
            zip_code: userData.address?.zipCode || null,
            // No user_id since this is a directory-only user (not authenticated)
            user_id: null,
            roles: userData.roles || [],
            // Set audit fields to null for directory-only users (mail-in entries)
            created_by: null,
            updated_by: null
          };
          
          // Save to database first
          const { createUser } = await import('@/services/database/queries/userQueries');
          const { mapDatabaseToUser } = await import('@/services/mappers/userMappers');
          
          const { data: dbUser, error: dbError } = await createUser(dbUserData);
          
          if (dbError || !dbUser) {
            throw new Error(dbError?.message || 'Failed to create user in database');
          }
          
          // Map database result to User object
          const newUser = mapDatabaseToUser(dbUser);
          
          // Update store with the actual database result
          set((state) => ({
            users: [...state.users, newUser],
            people: [...state.people, newUser], // Backward compatibility
            isLoading: false
          }));
          
          
          return newUser;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to add person';
          reportStoreError('addUser', 'userStore', error, { userName: `${userData.firstName} ${userData.lastName}` });
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
          const { updateUser: updateUserInDb } = await import('@/services/database/queries/userQueries');
          const { mapUserInputToUpdate, mapDatabaseToUser } = await import('@/services/mappers/userMappers');
          
          // Convert updates to database format
          const dbUpdates = mapUserInputToUpdate(updates);
          
          // Save to database first
          const { data: dbUser, error: dbError } = await updateUserInDb(id, dbUpdates);
          
          if (dbError || !dbUser) {
            throw new Error(dbError?.message || 'Failed to update user in database');
          }
          
          // Map database result to User object
          const updatedUser = mapDatabaseToUser(dbUser);
          
          // Update store with the actual database result
          set((state) => ({
            users: state.users.map(u => u.id === id ? updatedUser : u),
            people: state.people.map(u => u.id === id ? updatedUser : u), // Backward compatibility
            isLoading: false
          }));
          
          
          return updatedUser;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to update user';
          reportStoreError('updateUser', 'userStore', error, { userId: id, updates });
          set({ error: errorMessage, isLoading: false });
          
          // Revert optimistic update by reloading current user data
          const currentUser = get().users.find(u => u.id === id);
          if (currentUser) {
            set((state) => ({
              users: state.users.map(u => u.id === id ? currentUser : u),
              people: state.people.map(u => u.id === id ? currentUser : u), // Backward compatibility
            }));
          }
          
          throw error;
        }
      },
      
      deleteUser: async (id: string): Promise<void> => {
        try {
          set({ isLoading: true, error: null });
          
          const userExists = get().users.some(u => u.id === id);
          if (!userExists) {
            const error = `User with id ${id} not found`;
            set({ error, isLoading: false });
            return;
          }
          
          // Soft delete from database
          const { deleteUser: deleteUserFromDb } = await import('@/services/database/queries/userQueries');
          const { error: dbError } = await deleteUserFromDb(id);

          if (dbError) {
            throw new Error(dbError.message || 'Failed to delete user from database');
          }

          // Remove from local state after successful DB delete
          set((state) => ({
            users: state.users.filter(u => u.id !== id),
            people: state.people.filter(u => u.id !== id),
            isLoading: false
          }));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to delete user';
          reportStoreError('deleteUser', 'userStore', error, { userId: id });
          set({ error: errorMessage, isLoading: false });
          throw error;
        }
      },
      
      getUserById: (id: string): User | null => {
        return get().users.find(u => u.id === id) || null;
      },
      
      // Data Management
      setUsers: (users) => set({ users, people: users }),
      
      loadUsers: async (): Promise<void> => {
        try {
          set({ isLoading: true, error: null });
          
          // Import here to avoid circular dependencies
          const { getAllUsers } = await import('@/services/database/queries/userQueries');
          const { mapDatabaseToUser } = await import('@/services/mappers/userMappers');
          
          const { data, error } = await getAllUsers();
          
          if (error) {
            throw error;
          }
          
          // Map database results to User objects
          const users = data.map(mapDatabaseToUser);
          
          
          set({ 
            users,
            // Explicitly set people for backward compatibility
            people: users,
            isLoading: false,
            error: null 
          });
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to load users';
          logger.error('💥 Failed to load users:', 'store', {}, error as Error);
          reportStoreError('loadUsers', 'userStore', error);
          set({ error: errorMessage, isLoading: false });
        }
      },
      
      // Sync Status
      getSyncStatus: (id: string): 'synced' | 'pending' | 'error' | 'conflict' => {
        const user = get().users.find(u => u.id === id);
        return user?._syncStatus || 'synced';
      },
      
      // Primary methods using new terminology
      addUserLegacy: (user) => set((state) => ({
        users: [...state.users, user],
        people: [...state.people, user],
      })),
      updateUserLegacy: (user) => set((state) => ({
        users: state.users.map((u) => u.id === user.id ? user : u),
        people: state.people.map((u) => u.id === user.id ? user : u),
      })),
      removeUser: (id) => set((state) => ({
        users: state.users.filter((u) => u.id !== id),
        people: state.people.filter((u) => u.id !== id),
      })),

      // Legacy aliases for backward compatibility
      addPersonLegacy: (person) => set((state) => ({
        users: [...state.users, person],
        people: [...state.people, person],
      })),
      updatePersonLegacy: (person) => set((state) => ({
        users: state.users.map((u) => u.id === person.id ? person : u),
        people: state.people.map((u) => u.id === person.id ? person : u),
      })),
      removePerson: (id) => set((state) => ({
        users: state.users.filter((u) => u.id !== id),
        people: state.people.filter((u) => u.id !== id),
      })),
      getPersonById: (id: string): User | null => {
        return get().users.find(u => u.id === id) || null;
      },
      setPeople: (people) => set({ users: people, people: people }),
      loadPeople: async (): Promise<void> => {
        // Delegate to loadUsers for backward compatibility
        return get().loadUsers();
      },

      // Dialog and selection state using new terminology
      isAddUserDialogOpen: false,
      setIsAddUserDialogOpen: (open) => set({ isAddUserDialogOpen: open }),
      isEditUserDialogOpen: false,
      setIsEditUserDialogOpen: (open) => set({ isEditUserDialogOpen: open }),
      
      // Legacy aliases for dialog state
      isAddPersonDialogOpen: false,
      setIsAddPersonDialogOpen: (open) => set({ isAddUserDialogOpen: open }),
      isEditPersonDialogOpen: false,
      setIsEditPersonDialogOpen: (open) => set({ isEditUserDialogOpen: open }),
      isDeleteDialogOpen: false,
      setIsDeleteDialogOpen: (open) => set({ isDeleteDialogOpen: open }),
      isViewDetailsDialogOpen: false,
      setIsViewDetailsDialogOpen: (open) => set({ isViewDetailsDialogOpen: open }),
      selectedUser: null,
      setSelectedUser: (user) => set({ selectedUser: user }),
      
      // Legacy alias
      setSelectedPerson: (person) => set({ selectedUser: person }),
      
      // Cleanup
      reset: () => set({
        users: [],
        people: [], // Reset backward compatibility property too
        isLoading: false,
        error: null,
        selectedUser: null,
        isAddUserDialogOpen: false,
        isEditUserDialogOpen: false,
        isDeleteDialogOpen: false,
        isViewDetailsDialogOpen: false
      })
    }),
    {
      name: 'myk9show-user-storage',
      storage: createJSONStorage(() => getOptimalStorage('users')),
      // Only persist the users data, not the UI state
      partialize: (state) => ({
        users: state.users,
      }),
      // Sync `people` from `users` after rehydration so the two arrays
      // are always in sync.  `people` is NOT persisted (redundant copy),
      // so without this merge it would stay as [] after rehydration while
      // `users` has the restored data — causing dropdowns that read from
      // `people` to appear empty.
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState as Partial<UserStore>),
        people: (persistedState as Partial<UserStore>).users ?? currentState.users,
      }),
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
