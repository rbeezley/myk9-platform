import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';
import { createOwnedShowTeardown } from '../helpers/ownedShowTeardown';

type E2eResult = { success: boolean; [key: string]: unknown };

test.describe('Show CRUD Operations', () => {
  let testSetup: TestSetup;
  let ownedShows: ReturnType<typeof createOwnedShowTeardown>;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
    ownedShows = createOwnedShowTeardown();
  });

  test.afterEach(async ({ page }) => {
    await ownedShows.cleanup(page);
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
        shows: data.slice(0, 5).map(s => ({ id: s.id, name: s.name })),
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

    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 30);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 2);
    const testShowData = {
      name: `E2E Test Show ${Date.now()}`,
      organization: 'AKC',
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      location: 'Test Venue, Test City, TS',
      status: 'draft',
      max_total_entries: 100,
      pre_entry_fee: 25,
    };
    const result = await ownedShows.create(page, testShowData);

    console.log('Show create result:', result);
    expect(result.error).toBeNull();
    expect(result.data?.id).toBeTruthy();
    expect(result.data?.name).toContain('E2E Test Show');
    expect(result.data?.organization).toBe('AKC');
  });

  test('should update an existing show in database (UPDATE)', async ({ page }) => {
    console.log('=== Testing Show Update ===');

    // Sign in as admin (required for RLS write permissions)
    await testSetup.signIn('admin');
    await page.waitForLoadState('networkidle');

    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 60);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 2);
    const testShowData = {
      name: `Update Test Show ${Date.now()}`,
      organization: 'AKC',
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      location: 'Original Venue',
      status: 'draft',
    };
    const { data: createdShow, error: createError } = await ownedShows.create(page, testShowData);
    const result: E2eResult =
      createError || !createdShow
        ? { success: false, error: createError?.message || 'Failed to create show' }
        : await page.evaluate(
            async ({ showId, originalLocation }) => {
              const { updateShow } = await import('/src/services/database/shows/index.ts');

              // MYK9-579: 'upcoming' exercises the status update without depending
              // on a seed club's Stripe fixture remaining payouts-enabled.
              const updatedLocation = 'Updated Venue, New City';
              const updatedStatus = 'upcoming';
              const { data: updatedShow, error: updateError } = await updateShow(showId, {
                location: updatedLocation,
                status: updatedStatus,
                max_total_entries: 150,
              });

              if (updateError) return { success: false, showId, error: updateError.message };

              return {
                success: true,
                showId,
                originalLocation,
                updatedLocation: updatedShow?.location,
                updatedStatus: updatedShow?.status,
                locationMatches: updatedShow?.location === updatedLocation,
                statusMatches: updatedShow?.status === updatedStatus,
              };
            },
            { showId: createdShow.id, originalLocation: testShowData.location }
          );

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

    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 30);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 2);
    const testShowData = {
      name: `E2E Test Show ${Date.now()}`,
      organization: 'AKC',
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      location: 'Test Venue, Test City, TS',
      status: 'draft',
      max_total_entries: 100,
      pre_entry_fee: 25,
    };
    const { data: createdShow, error: createError } = await ownedShows.create(page, testShowData);
    const result: E2eResult =
      createError || !createdShow
        ? { success: false, error: createError?.message || 'Failed to create show' }
        : await page.evaluate(async showId => {
            const { deleteShow, getShowById } =
              await import('/src/services/database/shows/index.ts');

            const { error: deleteError } = await deleteShow(showId);
            if (deleteError) return { success: false, showId, error: deleteError.message };

            const { data: fetchedShow, error: fetchError } = await getShowById(showId);
            return { success: true, showId, showDeleted: !fetchedShow || !!fetchError };
          }, createdShow.id);

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
          startDate: s.start_date,
        })),
      };
    });

    console.log('Upcoming shows result:', result);
    expect(result.success).toBe(true);
    expect(result.count).toBeGreaterThanOrEqual(0);
  });
});
