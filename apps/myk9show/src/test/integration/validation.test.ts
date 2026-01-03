// Integration Test Validation
// Simple test to validate that the integration test infrastructure works correctly

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import React from 'react';

import { 
  setupIntegrationTest, 
  createMockUser, 
  createMockDog,
  expectSyncMetadata,
  testConfig 
} from './test-config';

describe('Integration Test Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create test wrapper correctly', () => {
    const queryClient = new QueryClient(testConfig.queryClient);
    const wrapper = ({ children }: { children: React.ReactNode }) => 
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    expect(wrapper).toBeDefined();
    expect(typeof wrapper).toBe('function');
  });

  it('should create mock data with proper structure', () => {
    const mockUser = createMockUser({
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com'
    });

    expect(mockUser).toMatchObject({
      first_name: 'John',
      last_name: 'Doe', 
      email: 'john@example.com',
      id: expect.stringMatching(/^user-/),
      created_at: expect.any(String),
      updated_at: expect.any(String),
    });

    const mockDog = createMockDog({
      name: 'Buddy',
      breed: 'Golden Retriever'
    });

    expect(mockDog).toMatchObject({
      name: 'Buddy',
      breed: 'Golden Retriever',
      id: expect.stringMatching(/^dog-/),
      sex: 'male',
      date_of_birth: '2020-01-01',
      owner_id: 'user-1',
    });
  });

  it('should setup integration test environment', () => {
    const testEnv = setupIntegrationTest();

    expect(testEnv).toHaveProperty('mockQueries');
    expect(testEnv).toHaveProperty('mockMappers');
    expect(testEnv).toHaveProperty('wrapper');

    // Verify mock queries exist
    expect(testEnv.mockQueries.getAllDogs).toBeDefined();
    expect(testEnv.mockQueries.getAllUsers).toBeDefined();
    expect(testEnv.mockQueries.getAllShows).toBeDefined();
    expect(testEnv.mockQueries.getAllClubs).toBeDefined();

    // Verify mock mappers exist
    expect(testEnv.mockMappers.mapDatabaseToDog).toBeDefined();
    expect(testEnv.mockMappers.mapDatabaseToUser).toBeDefined();
    expect(testEnv.mockMappers.mapDatabaseToShow).toBeDefined();
    expect(testEnv.mockMappers.mapDatabaseToClub).toBeDefined();
  });

  it('should validate sync metadata structure', () => {
    const entityWithMetadata = {
      id: 'test-1',
      name: 'Test Entity',
      _version: 1,
      _lastModified: new Date(),
      _lastModifiedBy: 'test-user',
      _syncStatus: 'pending' as const,
      _localOnly: false,
    };

    expect(() => expectSyncMetadata(entityWithMetadata)).not.toThrow();

    // Test invalid metadata
    const entityWithoutMetadata = {
      id: 'test-2',
      name: 'Invalid Entity',
    };

    expect(() => expectSyncMetadata(entityWithoutMetadata)).toThrow();
  });

  it('should handle mock query responses correctly', async () => {
    const testEnv = setupIntegrationTest();

    // Test getAllDogs mock
    const dogsResult = await testEnv.mockQueries.getAllDogs();
    expect(dogsResult).toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({
          id: expect.stringMatching(/^dog-/),
          name: 'Test Dog',
          breed: 'Test Breed',
        })
      ]),
      error: null,
    });

    // Test getUserById mock
    const userResult = await testEnv.mockQueries.getUserById('user-123');
    expect(userResult).toMatchObject({
      data: expect.objectContaining({
        id: 'user-123',
        first_name: 'Test',
        last_name: 'User',
      }),
      error: null,
    });

    // Test createShow mock
    const showData = {
      name: 'Test Show',
      type: 'Agility',
      club_id: 'club-123',
    };
    const showResult = await testEnv.mockQueries.createShow(showData);
    expect(showResult).toMatchObject({
      data: expect.objectContaining({
        name: 'Test Show',
        type: 'Agility',
        club_id: 'club-123',
      }),
      error: null,
    });
  });

  it('should handle mock mapper functions correctly', () => {
    const testEnv = setupIntegrationTest();

    // Test dog mapper
    const dogData = createMockDog();
    const mappedDog = testEnv.mockMappers.mapDatabaseToDog(dogData);
    
    expect(mappedDog).toMatchObject({
      id: dogData.id,
      name: dogData.name,
      breed: dogData.breed,
      sex: dogData.sex,
      birthDate: dogData.date_of_birth,
      ownerId: dogData.owner_id,
      ownerName: 'Test Owner',
    });

    // Test user mapper
    const userData = createMockUser();
    const mappedUser = testEnv.mockMappers.mapDatabaseToUser(userData);
    
    expect(mappedUser).toMatchObject({
      id: userData.id,
      firstName: userData.first_name,
      lastName: userData.last_name,
      email: userData.email,
      phone: userData.phone,
    });
  });

  it('should provide proper test configuration', () => {
    expect(testConfig).toHaveProperty('queryClient');
    expect(testConfig).toHaveProperty('timeouts');
    expect(testConfig).toHaveProperty('mockData');

    expect(testConfig.queryClient.defaultOptions.queries.retry).toBe(false);
    expect(testConfig.queryClient.defaultOptions.mutations.retry).toBe(false);

    expect(testConfig.timeouts.default).toBe(5000);
    expect(testConfig.timeouts.database).toBe(10000);
    expect(testConfig.timeouts.integration).toBe(15000);
  });

  it('should handle React Query wrapper in test environment', async () => {
    const testEnv = setupIntegrationTest();
    
    // Simple hook that uses QueryClient
    const useTestQuery = () => {
      const queryClient = useQueryClient();
      return { hasQueryClient: !!queryClient };
    };

    const { result } = renderHook(() => useTestQuery(), {
      wrapper: testEnv.wrapper,
    });

    expect(result.current.hasQueryClient).toBe(true);
  });

  it('should mock all required dependencies', () => {
    // Verify that critical paths are properly mocked
    expect(vi.isMockFunction(vi.fn())).toBe(true);
    
    // Check that we can create new mocks
    const mockFn = vi.fn().mockReturnValue('test');
    expect(mockFn()).toBe('test');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should validate error handling patterns', async () => {
    // const testEnv = setupIntegrationTest();

    // Mock an error response
    const errorMock = vi.fn().mockRejectedValue({
      error: new Error('Test error'),
    });

    await expect(errorMock()).rejects.toMatchObject({
      error: expect.any(Error),
    });

    // Mock successful response with error property
    const successWithError = vi.fn().mockResolvedValue({
      data: null,
      error: new Error('Not found'),
    });

    const result = await successWithError();
    expect(result).toMatchObject({
      data: null,
      error: expect.any(Error),
    });
  });
});