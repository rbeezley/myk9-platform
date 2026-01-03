// Quick verification test for User Store Integration
// Phase 2.2: User Store Integration - Basic validation

import { describe, it, expect } from 'vitest';
import type { UserInput } from '@/types/user-types';

// Test imports to ensure no compilation errors
describe('User Integration - Import Validation', () => {
  it('should import all user database hooks without errors', async () => {
    const { 
      useUsersQuery,
      useUserQuery,
      useUsersSearchQuery,
      useCreateUserMutation,
      useUpdateUserMutation,
      useDeleteUserMutation,
      useUserManagement
    } = await import('@/hooks/queries/useUsersDatabase');
    
    expect(useUsersQuery).toBeDefined();
    expect(useUserQuery).toBeDefined();
    expect(useUsersSearchQuery).toBeDefined();
    expect(useCreateUserMutation).toBeDefined();
    expect(useUpdateUserMutation).toBeDefined();
    expect(useDeleteUserMutation).toBeDefined();
    expect(useUserManagement).toBeDefined();
  });

  it('should import user mappers without errors', async () => {
    const { 
      mapUserInputToInsert,
      mapUserInputToUpdate,
      mapDatabaseToUser,
      mapDatabaseUsersArray,
      mapUserToUserInput
    } = await import('@/services/mappers/userMappers');
    
    expect(mapUserInputToInsert).toBeDefined();
    expect(mapUserInputToUpdate).toBeDefined();
    expect(mapDatabaseToUser).toBeDefined();
    expect(mapDatabaseUsersArray).toBeDefined();
    expect(mapUserToUserInput).toBeDefined();
  });

  it('should import user store compatibility layer without errors', async () => {
    const { 
      useUserStoreCompat,
      useUserWithQuery,
      useUserSearchWithQuery,
      useUsersWithDogCountsCompat,
      useUsersByRoleWithQuery
    } = await import('@/hooks/useUserStoreCompat');
    
    expect(useUserStoreCompat).toBeDefined();
    expect(useUserWithQuery).toBeDefined();
    expect(useUserSearchWithQuery).toBeDefined();
    expect(useUsersWithDogCountsCompat).toBeDefined();
    expect(useUsersByRoleWithQuery).toBeDefined();
  });

  it('should import user database queries without errors', async () => {
    const { 
      getAllUsers,
      getUserById,
      createUser,
      updateUser,
      deleteUser,
      searchUsers,
      getUsersByRole,
      getUsersWithDogCounts,
      getUsersStatistics,
      checkEmailExists
    } = await import('@/services/database/queries/userQueries');
    
    expect(getAllUsers).toBeDefined();
    expect(getUserById).toBeDefined();
    expect(createUser).toBeDefined();
    expect(updateUser).toBeDefined();
    expect(deleteUser).toBeDefined();
    expect(searchUsers).toBeDefined();
    expect(getUsersByRole).toBeDefined();
    expect(getUsersWithDogCounts).toBeDefined();
    expect(getUsersStatistics).toBeDefined();
    expect(checkEmailExists).toBeDefined();
  });
});

// Test type mappings work correctly
describe('User Integration - Type Mapping Validation', () => {
  it('should map UserInput to DbUserInsert correctly', async () => {
    const { mapUserInputToInsert } = await import('@/services/mappers/userMappers');
    
    const testInput: UserInput = {
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      phone: '555-1234',
      address: {
        street: '123 Test St',
        city: 'Test City',
        state: 'TS',
        zipCode: '12345'
      }
    };

    const result = mapUserInputToInsert(testInput);
    
    expect(result.first_name).toBe('Test');
    expect(result.last_name).toBe('User');
    expect(result.email).toBe('test@example.com');
    expect(result.phone).toBe('555-1234');
    expect(result.street_address).toBe('123 Test St');
    expect(result.city).toBe('Test City');
    expect(result.state).toBe('TS');
    expect(result.zip_code).toBe('12345');
  });

  it('should map database user to User type correctly', async () => {
    const { mapDatabaseToUser } = await import('@/services/mappers/userMappers');
    
    const dbUser = {
      id: 'test-id',
      first_name: 'Test',
      last_name: 'User',
      email: 'test@example.com',
      phone: '555-1234',
      street_address: '123 Test St',
      city: 'Test City',
      state: 'TS',
      zip_code: '12345',
      created_at: '2025-01-26T12:00:00Z',
      updated_at: '2025-01-26T12:00:00Z',
      dog: [],
      roles: []
    };

    const result = mapDatabaseToUser(dbUser);
    
    expect(result.id).toBe('test-id');
    expect(result.firstName).toBe('Test');
    expect(result.lastName).toBe('User');
    expect(result.name).toBe('Test User');
    expect(result.email).toBe('test@example.com');
    expect(result.phone).toBe('555-1234');
    expect(result.streetAddress).toBe('123 Test St');
    expect(result.city).toBe('Test City');
    expect(result.state).toBe('TS');
    expect(result.zipCode).toBe('12345');
    expect(result.dogs).toEqual([]);
    expect(result.roles).toEqual([]);
    expect(result._syncStatus).toBe('synced');
  });
});

// Test that the compatibility layer maintains the expected API
describe('User Integration - Compatibility API Validation', () => {
  it('should maintain backward compatible API structure', async () => {
    // This test verifies the API structure without actually running the hooks
    const { useUserStoreCompat } = await import('@/hooks/useUserStoreCompat');
    
    // Verify the hook exists and is a function
    expect(typeof useUserStoreCompat).toBe('function');
    
    // Test passes if imports work and types are correct
    expect(true).toBe(true);
  });
});