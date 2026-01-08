import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';

test.describe('Dog CRUD Operations', () => {
  let testSetup: TestSetup;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
  });

  test('should query dogs from Supabase database (READ - no auth)', async ({ page }) => {
    console.log('=== Testing Dog Read (No Auth) ===');

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const dbResult = await page.evaluate(async () => {
      const { getAllDogs } = await import('/src/services/database/queries/dogQueries.ts');

      const { data, error } = await getAllDogs();

      if (error) {
        return { success: false, error: error.message, count: 0, dogs: [] };
      }

      return {
        success: true,
        count: data?.length || 0,
        dogs: data?.slice(0, 5).map(d => ({ id: d.id, name: d.name })) || []
      };
    });

    console.log('Database query result:', dbResult);
    expect(dbResult.success).toBe(true);
    expect(dbResult.count).toBeGreaterThanOrEqual(0);
  });

  test('should create a new dog in database (CREATE)', async ({ page }) => {
    console.log('=== Testing Dog Create ===');

    // Sign in as admin (required for RLS write permissions)
    await testSetup.signIn('admin');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async () => {
      const { createUser, deleteUser } = await import('/src/services/database/queries/userQueries.ts');
      const { createDog, deleteDog } = await import('/src/services/database/queries/dogQueries.ts');

      // First create an owner (user)
      const ownerData = {
        first_name: 'Test',
        last_name: `Owner ${Date.now()}`,
        email: `testowner${Date.now()}@example.com`
      };

      const { data: createdOwner, error: ownerError } = await createUser(ownerData);
      if (ownerError || !createdOwner) {
        return { success: false, error: ownerError?.message || 'Failed to create owner' };
      }

      // Create a dog for this owner
      const dogData = {
        owner_id: createdOwner.id,
        name: `E2E Test Dog ${Date.now()}`,
        breed: 'Golden Retriever',
        call_name: 'Buddy',
        sex: 'male',
        date_of_birth: '2020-01-15'
      };

      const { data: createdDog, error: dogError } = await createDog(dogData);

      // Clean up
      if (createdDog?.id) {
        await deleteDog(createdDog.id);
      }
      await deleteUser(createdOwner.id);

      if (dogError) {
        return { success: false, error: dogError.message };
      }

      return {
        success: true,
        dogId: createdDog?.id,
        dogName: createdDog?.name,
        ownerId: createdOwner.id
      };
    });

    console.log('Dog create result:', result);
    expect(result.success).toBe(true);
    expect(result.dogId).toBeTruthy();
    expect(result.dogName).toContain('E2E Test Dog');
  });

  test('should update an existing dog in database (UPDATE)', async ({ page }) => {
    console.log('=== Testing Dog Update ===');

    await testSetup.signIn('admin');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async () => {
      const { createUser, deleteUser } = await import('/src/services/database/queries/userQueries.ts');
      const { createDog, updateDog, deleteDog } = await import('/src/services/database/queries/dogQueries.ts');

      // Create owner
      const { data: createdOwner, error: ownerError } = await createUser({
        first_name: 'Update',
        last_name: `TestOwner ${Date.now()}`,
        email: `updatetestowner${Date.now()}@example.com`
      });

      if (ownerError || !createdOwner) {
        return { success: false, error: ownerError?.message || 'Failed to create owner' };
      }

      // Create dog
      const { data: createdDog, error: dogError } = await createDog({
        owner_id: createdOwner.id,
        name: `Update Test Dog ${Date.now()}`,
        breed: 'Labrador',
        call_name: 'Max',
        sex: 'male'
      });

      if (dogError || !createdDog) {
        await deleteUser(createdOwner.id);
        return { success: false, error: dogError?.message || 'Failed to create dog' };
      }

      // Update the dog
      const { data: updatedDog, error: updateError } = await updateDog(createdDog.id, {
        breed: 'Labrador Retriever',
        call_name: 'Maximus'
      });

      // Clean up
      await deleteDog(createdDog.id);
      await deleteUser(createdOwner.id);

      if (updateError) {
        return { success: false, error: updateError.message };
      }

      return {
        success: true,
        originalCallName: 'Max',
        updatedCallName: updatedDog?.call_name,
        updatedBreed: updatedDog?.breed,
        callNameMatches: updatedDog?.call_name === 'Maximus',
        breedMatches: updatedDog?.breed === 'Labrador Retriever'
      };
    });

    console.log('Dog update result:', result);
    expect(result.success).toBe(true);
    expect(result.callNameMatches).toBe(true);
    expect(result.breedMatches).toBe(true);
  });

  test('should delete a dog from database (DELETE)', async ({ page }) => {
    console.log('=== Testing Dog Delete ===');

    await testSetup.signIn('admin');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async () => {
      const { createUser, deleteUser } = await import('/src/services/database/queries/userQueries.ts');
      const { createDog, deleteDog, getDogById } = await import('/src/services/database/queries/dogQueries.ts');

      // Create owner
      const { data: createdOwner, error: ownerError } = await createUser({
        first_name: 'Delete',
        last_name: `TestOwner ${Date.now()}`,
        email: `deletetestowner${Date.now()}@example.com`
      });

      if (ownerError || !createdOwner) {
        return { success: false, error: ownerError?.message || 'Failed to create owner' };
      }

      // Create dog
      const { data: createdDog, error: dogError } = await createDog({
        owner_id: createdOwner.id,
        name: `Delete Test Dog ${Date.now()}`,
        breed: 'Beagle',
        sex: 'female'
      });

      if (dogError || !createdDog) {
        await deleteUser(createdOwner.id);
        return { success: false, error: dogError?.message || 'Failed to create dog' };
      }

      // Soft delete the dog
      const { error: deleteError } = await deleteDog(createdDog.id);

      // Verify dog is soft-deleted (should not be found by normal query)
      const { data: checkDog } = await getDogById(createdDog.id);

      // Clean up owner
      await deleteUser(createdOwner.id);

      return {
        success: !deleteError,
        dogId: createdDog.id,
        dogDeleted: !checkDog,
        error: deleteError?.message
      };
    });

    console.log('Dog delete result:', result);
    expect(result.success).toBe(true);
    expect(result.dogDeleted).toBe(true);
  });

  test('should search dogs by name or breed', async ({ page }) => {
    console.log('=== Testing Dog Search ===');

    await testSetup.signIn('admin');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async () => {
      const { createUser, deleteUser } = await import('/src/services/database/queries/userQueries.ts');
      const { createDog, deleteDog, searchDogs } = await import('/src/services/database/queries/dogQueries.ts');

      // Create owner
      const { data: createdOwner, error: ownerError } = await createUser({
        first_name: 'Search',
        last_name: `TestOwner ${Date.now()}`,
        email: `searchtestowner${Date.now()}@example.com`
      });

      if (ownerError || !createdOwner) {
        return { success: false, error: ownerError?.message || 'Failed to create owner' };
      }

      // Create a dog with a unique searchable name
      const uniqueName = `SearchTestDog${Date.now()}`;
      const { data: createdDog, error: dogError } = await createDog({
        owner_id: createdOwner.id,
        name: uniqueName,
        breed: 'UniqueBreedPoodle',
        sex: 'male'
      });

      if (dogError || !createdDog) {
        await deleteUser(createdOwner.id);
        return { success: false, error: dogError?.message || 'Failed to create dog' };
      }

      // Search for the dog by name
      const { data: searchResults, error: searchError } = await searchDogs('SearchTestDog');

      // Clean up
      await deleteDog(createdDog.id);
      await deleteUser(createdOwner.id);

      if (searchError) {
        return { success: false, error: searchError.message };
      }

      const foundOurDog = searchResults?.some(d => d.name === uniqueName);

      return {
        success: true,
        searchTerm: 'SearchTestDog',
        resultsCount: searchResults?.length || 0,
        foundTestDog: foundOurDog
      };
    });

    console.log('Dog search result:', result);
    expect(result.success).toBe(true);
    expect(result.foundTestDog).toBe(true);
  });
});
