import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';

test.describe('Club CRUD Operations', () => {
  let testSetup: TestSetup;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
  });

  test('should query clubs from Supabase database (READ - no auth)', async ({ page }) => {
    console.log('=== Testing Club Read (No Auth) ===');

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const dbResult = await page.evaluate(async () => {
      const { getAllClubs } = await import('/src/services/database/queries/clubQueries.ts');

      const { data, error } = await getAllClubs();

      if (error) {
        return { success: false, error: error.message, count: 0, clubs: [] };
      }

      return {
        success: true,
        count: data.length,
        clubs: data.slice(0, 5).map(c => ({ id: c.id, name: c.name }))
      };
    });

    console.log('Database query result:', dbResult);
    expect(dbResult.success).toBe(true);
    // Count should be >= 0 (empty table is valid)
    expect(dbResult.count).toBeGreaterThanOrEqual(0);
  });

  test('should create a new club in database (CREATE)', async ({ page }) => {
    console.log('=== Testing Club Create ===');

    // Sign in as admin (required for RLS write permissions)
    await testSetup.signIn('admin');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async () => {
      const { createClub, deleteClub } = await import('/src/services/database/queries/clubQueries.ts');

      const testClubData = {
        name: `E2E Test Club ${Date.now()}`,
        email: 'e2e-test@testclub.com',
        phone: '555-0199',
        description: 'E2E Test Club - Created for testing',
        address: '123 Test St, Test City, TS 12345',
        website: 'https://testclub.example.com'
      };

      const { data: createdClub, error: createError } = await createClub(testClubData);

      if (createError) {
        return { success: false, error: createError.message };
      }

      // Clean up - delete the test club
      if (createdClub?.id) {
        await deleteClub(createdClub.id);
      }

      return {
        success: true,
        clubId: createdClub?.id,
        clubName: createdClub?.name
      };
    });

    console.log('Club create result:', result);
    expect(result.success).toBe(true);
    expect(result.clubId).toBeTruthy();
    expect(result.clubName).toContain('E2E Test Club');
  });

  test('should update an existing club in database (UPDATE)', async ({ page }) => {
    console.log('=== Testing Club Update ===');

    // Sign in as admin (required for RLS write permissions)
    await testSetup.signIn('admin');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async () => {
      const { createClub, updateClub, deleteClub, getClubById } = await import('/src/services/database/queries/clubQueries.ts');

      // Create a test club
      const testClubData = {
        name: `Update Test Club ${Date.now()}`,
        email: 'update-test@testclub.com',
        phone: '555-0200',
        description: 'Club to be updated'
      };

      const { data: createdClub, error: createError } = await createClub(testClubData);

      if (createError || !createdClub) {
        return { success: false, error: createError?.message || 'Failed to create club' };
      }

      // Update the club
      const updatedPhone = '555-9999';
      const updatedDescription = 'Updated description';
      const { data: _updatedClub, error: updateError } = await updateClub(createdClub.id, {
        phone: updatedPhone,
        description: updatedDescription
      });

      if (updateError) {
        // Clean up
        await deleteClub(createdClub.id);
        return { success: false, error: updateError.message };
      }

      // Verify the update by fetching the club again
      const { data: fetchedClub } = await getClubById(createdClub.id);

      // Clean up
      await deleteClub(createdClub.id);

      return {
        success: true,
        originalPhone: testClubData.phone,
        updatedPhone: fetchedClub?.phone,
        updatedDescription: fetchedClub?.description,
        phoneMatches: fetchedClub?.phone === updatedPhone,
        descriptionMatches: fetchedClub?.description === updatedDescription
      };
    });

    console.log('Club update result:', result);
    expect(result.success).toBe(true);
    expect(result.phoneMatches).toBe(true);
    expect(result.descriptionMatches).toBe(true);
  });

  test('should delete a club from database (DELETE)', async ({ page }) => {
    console.log('=== Testing Club Delete ===');

    // Sign in as admin (required for RLS write permissions)
    await testSetup.signIn('admin');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async () => {
      const { createClub, deleteClub, getClubById } = await import('/src/services/database/queries/clubQueries.ts');

      // Create a test club
      const testClubData = {
        name: `Delete Test Club ${Date.now()}`,
        email: 'delete-test@testclub.com',
        phone: '555-0300',
        description: 'Club to be deleted'
      };

      const { data: createdClub, error: createError } = await createClub(testClubData);

      if (createError || !createdClub) {
        return { success: false, error: createError?.message || 'Failed to create club' };
      }

      const clubId = createdClub.id;

      // Delete the club
      const { error: deleteError } = await deleteClub(clubId);

      if (deleteError) {
        return { success: false, error: deleteError.message };
      }

      // Verify deletion by trying to fetch the club
      const { data: fetchedClub, error: fetchError } = await getClubById(clubId);

      return {
        success: true,
        clubId,
        clubDeleted: !fetchedClub || !!fetchError
      };
    });

    console.log('Club delete result:', result);
    expect(result.success).toBe(true);
    expect(result.clubDeleted).toBe(true);
  });

  test('should search clubs by name or address', async ({ page }) => {
    console.log('=== Testing Club Search ===');

    // Sign in as admin (required for RLS write permissions to create test data)
    await testSetup.signIn('admin');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async () => {
      const { createClub, deleteClub, searchClubs } = await import('/src/services/database/queries/clubQueries.ts');

      // Create a test club with a unique name
      const uniqueName = `SearchTest-${Date.now()}`;
      const testClubData = {
        name: uniqueName,
        email: 'search-test@testclub.com',
        address: '999 Search Ave, SearchCity, SC 99999'
      };

      const { data: createdClub, error: createError } = await createClub(testClubData);

      if (createError || !createdClub) {
        return { success: false, error: createError?.message || 'Failed to create club' };
      }

      // Search for the club
      const { data: searchResults, error: searchError } = await searchClubs('SearchTest');

      // Clean up
      await deleteClub(createdClub.id);

      if (searchError) {
        return { success: false, error: searchError.message };
      }

      const foundClub = searchResults.find(c => c.name === uniqueName);

      return {
        success: true,
        searchTerm: 'SearchTest',
        resultsCount: searchResults.length,
        foundTestClub: !!foundClub
      };
    });

    console.log('Club search result:', result);
    expect(result.success).toBe(true);
    expect(result.foundTestClub).toBe(true);
  });
});
