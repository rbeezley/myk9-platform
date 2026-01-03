# Zustand Store Integration Tests

This directory contains comprehensive integration tests for all Zustand stores in the myK9Show application. These tests verify the integration between stores and the database layer, test persistence mechanisms, and validate real-world usage scenarios.

## Test Files

### 1. `allStores.integration.test.ts` - Comprehensive Store Tests
**Scope**: All stores in `src/store/` directory  
**Focus**: Cross-store integration, database layer compatibility, persistence

**Test Coverage**:
- **Dog Store Integration**: UI state management, database compatibility layer, CRUD operations
- **User Store Integration**: Sync metadata, address handling, emergency contacts, backward compatibility  
- **Show Store Integration**: Club relationships, cascading deletes, judge assignments, trials
- **Club Store Integration**: Show relationships, upcoming/past events tracking
- **Template Store Integration**: Template management, search/filtering, validation
- **Class Template Store Integration**: Field management, rule validation, preview functionality
- **Cross-Store Relationships**: Dog-Owner, Show-Club, Club-Show associations
- **Error Handling**: Database errors, optimistic update rollbacks, sync failures
- **Performance**: Caching, loading states, concurrent operations
- **Persistence**: localStorage integration, migration handling, cleanup

**Key Test Scenarios**:
```typescript
// Database integration
const { result } = renderHook(() => useDogStoreCompat(), { wrapper });
expect(result.current._usingDatabase).toBe(true);

// Sync metadata tracking
const newUser = await result.current.addUser(userData);
expect(newUser._syncStatus).toBe('pending');
expect(newUser._version).toBe(1);

// Cross-store relationships
const dog = result.current.dogs[0];
const user = result.current.users[0];
expect(dog.ownerId).toBe(user.id);
```

### 2. `dogStore.integration.test.ts` - Detailed Dog Store Tests
**Scope**: Dog store and useDogStoreCompat hook  
**Focus**: Real-world dog management scenarios, database operations

**Test Coverage**:
- **UI State Management**: Selected dog state, persistence, reset functionality
- **Database Compatibility**: Full CRUD operations through compatibility layer
- **Individual Query Hooks**: `useDogWithQuery`, `useOwnerDogsWithQuery`
- **Real-world Scenarios**: Complete dog registration, multi-dog households, search/filtering
- **Performance**: Concurrent operations, caching, refetch functionality
- **Error Handling**: Non-existent dogs, validation errors, database failures

**Notable Features**:
- Comprehensive mock data with realistic dog information
- Tests for health records, registrations, microchip tracking
- Multi-owner household management scenarios
- Search and filtering by breed, sex, owner

### 3. `userStore.integration.test.ts` - Detailed User Store Tests  
**Scope**: User store and useUserStoreCompat hook
**Focus**: User lifecycle management, complex address/contact scenarios

**Test Coverage**:
- **Direct Store Operations**: CRUD with sync metadata, version tracking
- **Complex Address Management**: Structured address updates, formatting
- **Emergency Contact Management**: Adding, updating, removing contacts
- **Dialog State Management**: UI state for various dialogs and selections
- **Backward Compatibility**: People method aliases, legacy support
- **Bulk Operations**: Multiple user operations, concurrent updates
- **Real-world Workflows**: Complete user registration, profile updates

**Notable Features**:
- Complex address object handling and formatting
- Emergency contact relationship management
- UI dialog state integration testing
- Comprehensive error scenario coverage

### 4. `showStore.integration.test.ts` - Detailed Show Store Tests
**Scope**: Show store and club relationship integration  
**Focus**: Complex show management, multi-day events, club associations

**Test Coverage**:
- **Show Lifecycle Management**: Planning → Scheduled → Open → Closed → Completed
- **Multi-day Events**: Complex show structures with multiple trials
- **Club Integration**: Show-club relationships, upcoming/past show tracking  
- **Cascading Operations**: Safe deletion with related data cleanup
- **Judge Assignments**: Judge scheduling and assignment management
- **Search and Filtering**: By type, status, club, date ranges
- **Legacy Method Support**: Backward compatibility with older APIs

**Notable Features**:
- Realistic multi-day championship scenarios
- Judge assignment and trial management
- Cascading delete preview and execution
- Club relationship updating and verification

## Test Infrastructure

### Mock Setup
Each test file includes comprehensive mocking for:
- **Database Queries**: Full CRUD operations with realistic responses
- **Mappers**: Data transformation between store and database formats  
- **Sync Service**: Queue operations and error handling
- **Auth Helpers**: User identification and metadata
- **Storage Adapter**: localStorage simulation and persistence

### Test Utilities
```typescript
// React Query wrapper for testing
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  
  return ({ children }) => 
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

// Realistic mock data
const mockDogs = [
  {
    id: 'dog-1',
    name: 'Max',
    breed: 'Golden Retriever',
    owner: { first_name: 'John', last_name: 'Smith' }
  }
];
```

### Test Patterns

**Store Integration Pattern**:
```typescript
describe('Store Integration', () => {
  it('should handle CRUD operations with sync metadata', async () => {
    const { result } = renderHook(() => useStoreCompat());
    
    await act(async () => {
      const newEntity = await result.current.addEntity(data);
      expect(newEntity._syncStatus).toBe('pending');
      expect(newEntity._version).toBe(1);
    });
  });
});
```

**Cross-Store Relationship Pattern**:
```typescript
it('should maintain relationships between stores', async () => {
  const { result: dogResult } = renderHook(() => useDogStoreCompat());
  const { result: userResult } = renderHook(() => useUserStoreCompat());
  
  // Verify relationship data
  const dog = dogResult.current.dogs[0];
  const user = userResult.current.users[0];
  expect(dog.ownerId).toBe(user.id);
});
```

**Error Handling Pattern**:
```typescript
it('should handle errors gracefully', async () => {
  vi.mocked(mockQuery).mockRejectedValueOnce(new Error('Database error'));
  
  const { result } = renderHook(() => useStoreCompat());
  
  await waitFor(() => {
    expect(result.current.error).toBeTruthy();
    expect(result.current.data).toHaveLength(0);
  });
});
```

## Running Tests

```bash
# Run all integration tests
npm run test src/test/integration/

# Run specific test file
npm run test src/test/integration/allStores.integration.test.ts

# Run with coverage
npm run test:coverage src/test/integration/

# Run in watch mode
npm run test -- --watch src/test/integration/
```

## Test Coverage Goals

- **Database Integration**: 100% coverage of database compatibility layers
- **Store Operations**: 100% coverage of CRUD operations and state management
- **Error Scenarios**: 90% coverage of error handling and recovery
- **Real-world Workflows**: 80% coverage of typical user scenarios
- **Performance**: 70% coverage of optimization features

## Key Testing Principles

1. **Real-world Scenarios**: Tests reflect actual application usage patterns
2. **Database Integration**: All tests verify database layer compatibility  
3. **Error Handling**: Comprehensive error scenario coverage
4. **Performance**: Loading states, caching, and optimization testing
5. **Backward Compatibility**: Legacy method and API support verification
6. **Cross-Store Relationships**: Data consistency across related stores
7. **Persistence**: localStorage and state migration testing

## Mock Data Quality

The test files include realistic mock data that:
- Reflects actual data structures used in the application
- Includes edge cases and boundary conditions
- Covers various relationship scenarios (one-to-many, many-to-many)
- Simulates both success and error responses from the database
- Provides comprehensive coverage of all data fields and types

This ensures that integration tests are as close to real-world usage as possible while remaining fast and reliable for continuous integration.