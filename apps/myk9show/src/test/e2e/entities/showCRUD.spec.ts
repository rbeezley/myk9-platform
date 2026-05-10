import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';

test.describe('Show CRUD Operations', () => {
  let testSetup: TestSetup;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
  });

  test('should query shows from Supabase database (READ - no auth)', async ({ page }) => {
    console.log('=== Testing Show Read (No Auth) ===');

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const dbResult = await page.evaluate(async () => {
      const { getAllShows } = await import('/src/services/database/shows/index.ts');

      const { data, error } = await getAllShows();

      if (error) {
        return { success: false, error: error.message, count: 0, shows: [] };
      }

      return {
        success: true,
        count: data.length,
        shows: data.slice(0, 5).map(s => ({ id: s.id, name: s.name }))
      };
    });

    console.log('Database query result:', dbResult);
    expect(dbResult.success).toBe(true);
    expect(dbResult.count).toBeGreaterThanOrEqual(0);
  });

  test('should create a new show in database (CREATE)', async ({ page }) => {
    console.log('=== Testing Show Create ===');

    // Sign in as admin (required for RLS write permissions)
    await testSetup.signIn('admin');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async () => {
      const { createShow, deleteShow } = await import('/src/services/database/shows/index.ts');

      // Calculate dates
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 30);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 2);

      const testShowData = {
        name: `E2E Test Show ${Date.now()}`,
        type: 'conformation',
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        location: 'Test Venue, Test City, TS',
        status: 'draft',
        max_total_entries: 100,
        pre_entry_fee: 25
      };

      const { data: createdShow, error: createError } = await createShow(testShowData);

      if (createError) {
        return { success: false, error: createError.message };
      }

      // Clean up - delete the test show (soft delete)
      if (createdShow?.id) {
        await deleteShow(createdShow.id);
      }

      return {
        success: true,
        showId: createdShow?.id,
        showName: createdShow?.name,
        showType: createdShow?.type
      };
    });

    console.log('Show create result:', result);
    expect(result.success).toBe(true);
    expect(result.showId).toBeTruthy();
    expect(result.showName).toContain('E2E Test Show');
    expect(result.showType).toBe('conformation');
  });

  test('should update an existing show in database (UPDATE)', async ({ page }) => {
    console.log('=== Testing Show Update ===');

    // Sign in as admin (required for RLS write permissions)
    await testSetup.signIn('admin');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async () => {
      const { createShow, updateShow, deleteShow } = await import('/src/services/database/shows/index.ts');

      // Calculate dates
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 60);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 2);

      const testShowData = {
        name: `Update Test Show ${Date.now()}`,
        type: 'conformation',
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        location: 'Original Venue',
        status: 'draft'
      };

      const { data: createdShow, error: createError } = await createShow(testShowData);

      if (createError || !createdShow) {
        return { success: false, error: createError?.message || 'Failed to create show' };
      }

      // Update the show
      const updatedLocation = 'Updated Venue, New City';
      const updatedStatus = 'published';  // Valid status per check constraint
      const { data: _updatedShow, error: updateError } = await updateShow(createdShow.id, {
        location: updatedLocation,
        status: updatedStatus,
        max_total_entries: 150
      });

      if (updateError) {
        await deleteShow(createdShow.id);
        return { success: false, error: updateError.message };
      }

      // Verify the update using getAllShows (simpler query)
      const { getAllShows } = await import('/src/services/database/shows/index.ts');
      const { data: allShows } = await getAllShows();
      const fetchedShow = allShows.find((s: { id: string }) => s.id === createdShow.id);

      // Clean up
      await deleteShow(createdShow.id);

      return {
        success: true,
        originalLocation: testShowData.location,
        updatedLocation: fetchedShow?.location,
        updatedStatus: fetchedShow?.status,
        locationMatches: fetchedShow?.location === updatedLocation,
        statusMatches: fetchedShow?.status === updatedStatus
      };
    });

    console.log('Show update result:', result);
    expect(result.success).toBe(true);
    expect(result.locationMatches).toBe(true);
    expect(result.statusMatches).toBe(true);
  });

  test('should delete a show from database (DELETE)', async ({ page }) => {
    console.log('=== Testing Show Delete (Hard Delete) ===');

    // Sign in as admin (required for RLS write permissions)
    await testSetup.signIn('admin');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async () => {
      const { createShow, deleteShow, getShowById } = await import('/src/services/database/shows/index.ts');

      // Calculate dates
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 90);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 2);

      const testShowData = {
        name: `Delete Test Show ${Date.now()}`,
        type: 'conformation',
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        status: 'draft'
      };

      const { data: createdShow, error: createError } = await createShow(testShowData);

      if (createError || !createdShow) {
        return { success: false, error: createError?.message || 'Failed to create show' };
      }

      const showId = createdShow.id;

      // Delete the show (hard delete)
      const { error: deleteError } = await deleteShow(showId);

      if (deleteError) {
        return { success: false, error: deleteError.message };
      }

      // Verify deletion - show should not be found
      const { data: fetchedShow, error: fetchError } = await getShowById(showId);

      return {
        success: true,
        showId,
        showDeleted: !fetchedShow || !!fetchError
      };
    });

    console.log('Show delete result:', result);
    expect(result.success).toBe(true);
    expect(result.showDeleted).toBe(true);
  });

  test('should get upcoming shows', async ({ page }) => {
    console.log('=== Testing Get Upcoming Shows ===');

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async () => {
      const { getUpcomingShows } = await import('/src/services/database/shows/index.ts');

      const { data, error } = await getUpcomingShows(10);

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: true,
        count: data.length,
        shows: data.slice(0, 3).map(s => ({
          id: s.id,
          name: s.name,
          startDate: s.start_date
        }))
      };
    });

    console.log('Upcoming shows result:', result);
    expect(result.success).toBe(true);
    expect(result.count).toBeGreaterThanOrEqual(0);
  });
});
