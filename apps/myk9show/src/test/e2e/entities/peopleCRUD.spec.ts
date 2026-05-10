import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';

test.describe('People (User) CRUD Operations', () => {
  let testSetup: TestSetup;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
  });

  test('should query users from Supabase database (READ - no auth)', async ({ page }) => {
    console.log('=== Testing People Read (No Auth) ===');

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const dbResult = await page.evaluate(async () => {
      const { getAllUsers } = await import('/src/services/database/users/index.ts');

      const { data, error } = await getAllUsers();

      if (error) {
        return { success: false, error: error.message, count: 0, users: [] };
      }

      return {
        success: true,
        count: data?.length || 0,
        users: data?.slice(0, 5).map(u => ({
          id: u.id,
          name: `${u.first_name} ${u.last_name}`
        })) || []
      };
    });

    console.log('Database query result:', dbResult);
    expect(dbResult.success).toBe(true);
    expect(dbResult.count).toBeGreaterThanOrEqual(0);
  });

  test('should create a new user in database (CREATE)', async ({ page }) => {
    console.log('=== Testing People Create ===');

    // Sign in as admin (required for RLS write permissions)
    await testSetup.signIn('admin');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async () => {
      const { createUser, deleteUser } = await import('/src/services/database/users/index.ts');

      const userData = {
        first_name: 'E2E',
        last_name: `TestUser ${Date.now()}`,
        email: `e2etestuser${Date.now()}@example.com`,
        phone: '555-0100'
      };

      const { data: createdUser, error: createError } = await createUser(userData);

      // Clean up
      if (createdUser?.id) {
        await deleteUser(createdUser.id);
      }

      if (createError) {
        return { success: false, error: createError.message };
      }

      return {
        success: true,
        userId: createdUser?.id,
        firstName: createdUser?.first_name,
        lastName: createdUser?.last_name,
        email: createdUser?.email
      };
    });

    console.log('People create result:', result);
    expect(result.success).toBe(true);
    expect(result.userId).toBeTruthy();
    expect(result.firstName).toBe('E2E');
  });

  test('should update an existing user in database (UPDATE)', async ({ page }) => {
    console.log('=== Testing People Update ===');

    await testSetup.signIn('admin');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async () => {
      const { createUser, updateUser, deleteUser } = await import('/src/services/database/users/index.ts');

      // Create user
      const { data: createdUser, error: createError } = await createUser({
        first_name: 'Update',
        last_name: `TestPerson ${Date.now()}`,
        email: `updatetestperson${Date.now()}@example.com`,
        phone: '555-0200'
      });

      if (createError || !createdUser) {
        return { success: false, error: createError?.message || 'Failed to create user' };
      }

      // Update the user
      const { data: updatedUser, error: updateError } = await updateUser(createdUser.id, {
        phone: '555-9999',
        city: 'Test City',
        state: 'TS'
      });

      // Clean up
      await deleteUser(createdUser.id);

      if (updateError) {
        return { success: false, error: updateError.message };
      }

      return {
        success: true,
        originalPhone: '555-0200',
        updatedPhone: updatedUser?.phone,
        updatedCity: updatedUser?.city,
        phoneMatches: updatedUser?.phone === '555-9999',
        cityMatches: updatedUser?.city === 'Test City'
      };
    });

    console.log('People update result:', result);
    expect(result.success).toBe(true);
    expect(result.phoneMatches).toBe(true);
    expect(result.cityMatches).toBe(true);
  });

  test('should delete a user from database (DELETE)', async ({ page }) => {
    console.log('=== Testing People Delete ===');

    await testSetup.signIn('admin');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async () => {
      const { createUser, deleteUser, getUserById } = await import('/src/services/database/users/index.ts');

      // Create user
      const { data: createdUser, error: createError } = await createUser({
        first_name: 'Delete',
        last_name: `TestPerson ${Date.now()}`,
        email: `deletetestperson${Date.now()}@example.com`
      });

      if (createError || !createdUser) {
        return { success: false, error: createError?.message || 'Failed to create user' };
      }

      // Soft delete the user
      const { error: deleteError } = await deleteUser(createdUser.id);

      // Verify user is soft-deleted (should not be found by normal query)
      const { data: checkUser } = await getUserById(createdUser.id);

      return {
        success: !deleteError,
        userId: createdUser.id,
        userDeleted: !checkUser,
        error: deleteError?.message
      };
    });

    console.log('People delete result:', result);
    expect(result.success).toBe(true);
    expect(result.userDeleted).toBe(true);
  });

  test('should search users by name or email', async ({ page }) => {
    console.log('=== Testing People Search ===');

    await testSetup.signIn('admin');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async () => {
      const { createUser, deleteUser, searchUsers } = await import('/src/services/database/users/index.ts');

      // Create a user with a unique searchable name
      const uniqueLastName = `SearchablePerson${Date.now()}`;
      const { data: createdUser, error: createError } = await createUser({
        first_name: 'Searchable',
        last_name: uniqueLastName,
        email: `searchable${Date.now()}@example.com`
      });

      if (createError || !createdUser) {
        return { success: false, error: createError?.message || 'Failed to create user' };
      }

      // Search for the user
      const { data: searchResults, error: searchError } = await searchUsers('Searchable');

      // Clean up
      await deleteUser(createdUser.id);

      if (searchError) {
        return { success: false, error: searchError.message };
      }

      const foundOurUser = searchResults?.some(u => u.last_name === uniqueLastName);

      return {
        success: true,
        searchTerm: 'Searchable',
        resultsCount: searchResults?.length || 0,
        foundTestUser: foundOurUser
      };
    });

    console.log('People search result:', result);
    expect(result.success).toBe(true);
    expect(result.foundTestUser).toBe(true);
  });
});
