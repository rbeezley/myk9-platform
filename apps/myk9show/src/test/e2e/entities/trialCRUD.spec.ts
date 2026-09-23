import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';
import { createOwnedShowTeardown } from '../helpers/ownedShowTeardown';

type E2eResult = { success: boolean; [key: string]: unknown };

test.describe('Trial CRUD Operations', () => {
  let testSetup: TestSetup;
  let ownedShows: ReturnType<typeof createOwnedShowTeardown>;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
    ownedShows = createOwnedShowTeardown();
  });

  test.afterEach(async ({ page }) => {
    await ownedShows.cleanup(page);
  });

  test('should query trials from Supabase database (READ - no auth)', async ({ page }) => {
    console.log('=== Testing Trial Read (No Auth) ===');

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const dbResult = await page.evaluate(async () => {
      const { getAllTrials } = await import('/src/services/database/trials/index.ts');

      const { data, error } = await getAllTrials();

      if (error) {
        return { success: false, error: error.message, count: 0, trials: [] };
      }

      return {
        success: true,
        count: data?.length || 0,
        trials: data?.slice(0, 5).map(t => ({ id: t.id, name: t.name })) || [],
      };
    });

    console.log('Database query result:', dbResult);
    expect(dbResult.success).toBe(true);
    expect(dbResult.count).toBeGreaterThanOrEqual(0);
  });

  test('should create a new trial in database (CREATE)', async ({ page }) => {
    console.log('=== Testing Trial Create ===');

    // Sign in as admin (required for RLS write permissions)
    await testSetup.signIn('admin');
    await page.waitForLoadState('networkidle');

    const showStartDate = new Date();
    showStartDate.setDate(showStartDate.getDate() + 30);
    const showEndDate = new Date(showStartDate);
    showEndDate.setDate(showEndDate.getDate() + 3);
    const showData = {
      name: `Test Show for Trial ${Date.now()}`,
      organization: 'AKC',
      start_date: showStartDate.toISOString().split('T')[0],
      end_date: showEndDate.toISOString().split('T')[0],
      status: 'draft',
    };
    const { data: createdShow, error: showError } = await ownedShows.create(page, showData);
    const result: E2eResult =
      showError || !createdShow
        ? { success: false, error: showError?.message || 'Failed to create show' }
        : await page.evaluate(
            async ({ showId, date }) => {
              const { createTrial } = await import('/src/services/database/trials/index.ts');
              const { data: createdTrial, error: trialError } = await createTrial({
                show_id: showId,
                name: `E2E Test Trial ${Date.now()}`,
                date,
                trial_number: 'T1',
                status: 'upcoming',
              });

              if (trialError) return { success: false, error: trialError.message };
              return {
                success: true,
                trialId: createdTrial?.id,
                trialName: createdTrial?.name,
                showId,
              };
            },
            { showId: createdShow.id, date: showStartDate.toISOString().split('T')[0] }
          );

    console.log('Trial create result:', result);
    expect(result.success).toBe(true);
    expect(result.trialId).toBeTruthy();
    expect(result.trialName).toContain('E2E Test Trial');
  });

  test('should update an existing trial in database (UPDATE)', async ({ page }) => {
    console.log('=== Testing Trial Update ===');

    // Sign in as admin (required for RLS write permissions)
    await testSetup.signIn('admin');
    await page.waitForLoadState('networkidle');

    const showStartDate = new Date();
    showStartDate.setDate(showStartDate.getDate() + 60);
    const showEndDate = new Date(showStartDate);
    showEndDate.setDate(showEndDate.getDate() + 3);
    const showData = {
      name: `Update Test Show ${Date.now()}`,
      organization: 'AKC',
      start_date: showStartDate.toISOString().split('T')[0],
      end_date: showEndDate.toISOString().split('T')[0],
      status: 'draft',
    };
    const { data: createdShow, error: showError } = await ownedShows.create(page, showData);
    const result: E2eResult =
      showError || !createdShow
        ? { success: false, error: showError?.message || 'Failed to create show' }
        : await page.evaluate(
            async ({ showId, date }) => {
              const { createTrial, updateTrial } =
                await import('/src/services/database/trials/index.ts');
              const trialData = {
                show_id: showId,
                name: `Update Test Trial ${Date.now()}`,
                date,
                trial_number: 'T1',
                status: 'upcoming',
              };
              const { data: createdTrial, error: createError } = await createTrial(trialData);
              if (createError || !createdTrial) {
                return {
                  success: false,
                  error: createError?.message || 'Failed to create trial',
                };
              }

              const updatedName = 'Updated Trial Name';
              const updatedStatus = 'in_progress';
              const { data: updatedTrial, error: updateError } = await updateTrial(
                createdTrial.id,
                {
                  name: updatedName,
                  status: updatedStatus,
                  trial_number: 'T1-Updated',
                }
              );
              if (updateError) return { success: false, error: updateError.message };

              return {
                success: true,
                originalName: trialData.name,
                updatedName: updatedTrial?.name,
                updatedStatus: updatedTrial?.status,
                nameMatches: updatedTrial?.name === updatedName,
                statusMatches: updatedTrial?.status === updatedStatus,
              };
            },
            { showId: createdShow.id, date: showStartDate.toISOString().split('T')[0] }
          );

    console.log('Trial update result:', result);
    expect(result.success).toBe(true);
    expect(result.nameMatches).toBe(true);
    expect(result.statusMatches).toBe(true);
  });

  test('should delete a trial from database (DELETE)', async ({ page }) => {
    console.log('=== Testing Trial Delete ===');

    // Sign in as admin (required for RLS write permissions)
    await testSetup.signIn('admin');
    await page.waitForLoadState('networkidle');

    const showStartDate = new Date();
    showStartDate.setDate(showStartDate.getDate() + 90);
    const showEndDate = new Date(showStartDate);
    showEndDate.setDate(showEndDate.getDate() + 3);
    const showData = {
      name: `Delete Test Show ${Date.now()}`,
      organization: 'AKC',
      start_date: showStartDate.toISOString().split('T')[0],
      end_date: showEndDate.toISOString().split('T')[0],
      status: 'draft',
    };
    const { data: createdShow, error: showError } = await ownedShows.create(page, showData);
    const result: E2eResult =
      showError || !createdShow
        ? { success: false, error: showError?.message || 'Failed to create show' }
        : await page.evaluate(
            async ({ showId, date }) => {
              const { createTrial, deleteTrial, getTrialById } =
                await import('/src/services/database/trials/index.ts');
              const { data: createdTrial, error: createError } = await createTrial({
                show_id: showId,
                name: `Delete Test Trial ${Date.now()}`,
                date,
                trial_number: 'T1',
                status: 'upcoming',
              });
              if (createError || !createdTrial) {
                return {
                  success: false,
                  error: createError?.message || 'Failed to create trial',
                };
              }

              const { error: deleteError } = await deleteTrial(createdTrial.id);
              if (deleteError) return { success: false, error: deleteError.message };

              const { data: fetchedTrial, error: fetchError } = await getTrialById(createdTrial.id);
              return {
                success: true,
                trialId: createdTrial.id,
                trialDeleted: !fetchedTrial || !!fetchError,
              };
            },
            { showId: createdShow.id, date: showStartDate.toISOString().split('T')[0] }
          );

    console.log('Trial delete result:', result);
    expect(result.success).toBe(true);
    expect(result.trialDeleted).toBe(true);
  });

  test('should get trials by show ID', async ({ page }) => {
    console.log('=== Testing Get Trials By Show ===');

    // Sign in as admin (required for RLS write permissions)
    await testSetup.signIn('admin');
    await page.waitForLoadState('networkidle');

    const showStartDate = new Date();
    showStartDate.setDate(showStartDate.getDate() + 120);
    const showEndDate = new Date(showStartDate);
    showEndDate.setDate(showEndDate.getDate() + 3);
    const showData = {
      name: `Query Test Show ${Date.now()}`,
      organization: 'AKC',
      start_date: showStartDate.toISOString().split('T')[0],
      end_date: showEndDate.toISOString().split('T')[0],
      status: 'draft',
    };
    const { data: createdShow, error: showError } = await ownedShows.create(page, showData);
    const result: E2eResult =
      showError || !createdShow
        ? { success: false, error: showError?.message || 'Failed to create show' }
        : await page.evaluate(
            async ({ showId, startDate, secondDate }) => {
              const { createTrial, getTrialsByShow } =
                await import('/src/services/database/trials/index.ts');
              await createTrial({
                show_id: showId,
                name: 'Trial Day 1',
                date: startDate,
                trial_number: 'T1',
                status: 'upcoming',
              });
              await createTrial({
                show_id: showId,
                name: 'Trial Day 2',
                date: secondDate,
                trial_number: 'T2',
                status: 'upcoming',
              });

              const { data: trials, error: queryError } = await getTrialsByShow(showId);
              if (queryError) return { success: false, error: queryError.message };
              return {
                success: true,
                showId,
                trialsCount: trials?.length || 0,
                foundTrials: trials?.map((t: { name: string }) => t.name) || [],
              };
            },
            {
              showId: createdShow.id,
              startDate: showStartDate.toISOString().split('T')[0],
              secondDate: new Date(showStartDate.getTime() + 24 * 60 * 60 * 1000)
                .toISOString()
                .split('T')[0],
            }
          );

    console.log('Get trials by show result:', result);
    expect(result.success).toBe(true);
    expect(result.trialsCount).toBe(2);
  });
});
