import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';

test.describe('Trial CRUD Operations', () => {
  let testSetup: TestSetup;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
  });

  test('should query trials from Supabase database (READ - no auth)', async ({ page }) => {
    console.log('=== Testing Trial Read (No Auth) ===');

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const dbResult = await page.evaluate(async () => {
      const { getAllTrials } = await import('/src/services/database/queries/trialQueries.ts');

      const { data, error } = await getAllTrials();

      if (error) {
        return { success: false, error: error.message, count: 0, trials: [] };
      }

      return {
        success: true,
        count: data?.length || 0,
        trials: data?.slice(0, 5).map(t => ({ id: t.id, name: t.name })) || []
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

    const result = await page.evaluate(async () => {
      const { createShow, deleteShow } = await import('/src/services/database/queries/showQueries.ts');
      const { createTrial, deleteTrial } = await import('/src/services/database/queries/trialQueries.ts');

      // First create a show (trials require a show)
      const showStartDate = new Date();
      showStartDate.setDate(showStartDate.getDate() + 30);
      const showEndDate = new Date(showStartDate);
      showEndDate.setDate(showEndDate.getDate() + 3);

      const showData = {
        name: `Test Show for Trial ${Date.now()}`,
        type: 'conformation',
        start_date: showStartDate.toISOString().split('T')[0],
        end_date: showEndDate.toISOString().split('T')[0],
        status: 'draft'
      };

      const { data: createdShow, error: showError } = await createShow(showData);
      if (showError || !createdShow) {
        return { success: false, error: showError?.message || 'Failed to create show' };
      }

      // Create a trial for this show
      const trialData = {
        show_id: createdShow.id,
        name: `E2E Test Trial ${Date.now()}`,
        date: showStartDate.toISOString().split('T')[0],
        trial_number: 'T1',
        status: 'planned'
      };

      const { data: createdTrial, error: trialError } = await createTrial(trialData);

      // Clean up
      if (createdTrial?.id) {
        await deleteTrial(createdTrial.id);
      }
      await deleteShow(createdShow.id);

      if (trialError) {
        return { success: false, error: trialError.message };
      }

      return {
        success: true,
        trialId: createdTrial?.id,
        trialName: createdTrial?.name,
        showId: createdShow.id
      };
    });

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

    const result = await page.evaluate(async () => {
      const { createShow, deleteShow } = await import('/src/services/database/queries/showQueries.ts');
      const { createTrial, updateTrial, deleteTrial, getAllTrials } = await import('/src/services/database/queries/trialQueries.ts');

      // First create a show
      const showStartDate = new Date();
      showStartDate.setDate(showStartDate.getDate() + 60);
      const showEndDate = new Date(showStartDate);
      showEndDate.setDate(showEndDate.getDate() + 3);

      const showData = {
        name: `Update Test Show ${Date.now()}`,
        type: 'conformation',
        start_date: showStartDate.toISOString().split('T')[0],
        end_date: showEndDate.toISOString().split('T')[0],
        status: 'draft'
      };

      const { data: createdShow, error: showError } = await createShow(showData);
      if (showError || !createdShow) {
        return { success: false, error: showError?.message || 'Failed to create show' };
      }

      // Create a trial
      const trialData = {
        show_id: createdShow.id,
        name: `Update Test Trial ${Date.now()}`,
        date: showStartDate.toISOString().split('T')[0],
        trial_number: 'T1',
        status: 'planned'
      };

      const { data: createdTrial, error: createError } = await createTrial(trialData);
      if (createError || !createdTrial) {
        await deleteShow(createdShow.id);
        return { success: false, error: createError?.message || 'Failed to create trial' };
      }

      // Update the trial
      const updatedName = 'Updated Trial Name';
      const updatedStatus = 'published';
      const { error: updateError } = await updateTrial(createdTrial.id, {
        name: updatedName,
        status: updatedStatus,
        trial_number: 'T1-Updated'
      });

      if (updateError) {
        await deleteTrial(createdTrial.id);
        await deleteShow(createdShow.id);
        return { success: false, error: updateError.message };
      }

      // Verify the update
      const { data: allTrials } = await getAllTrials();
      const fetchedTrial = allTrials?.find((t: { id: string }) => t.id === createdTrial.id);

      // Clean up
      await deleteTrial(createdTrial.id);
      await deleteShow(createdShow.id);

      return {
        success: true,
        originalName: trialData.name,
        updatedName: fetchedTrial?.name,
        updatedStatus: fetchedTrial?.status,
        nameMatches: fetchedTrial?.name === updatedName,
        statusMatches: fetchedTrial?.status === updatedStatus
      };
    });

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

    const result = await page.evaluate(async () => {
      const { createShow, deleteShow } = await import('/src/services/database/queries/showQueries.ts');
      const { createTrial, deleteTrial, getTrialById } = await import('/src/services/database/queries/trialQueries.ts');

      // First create a show
      const showStartDate = new Date();
      showStartDate.setDate(showStartDate.getDate() + 90);
      const showEndDate = new Date(showStartDate);
      showEndDate.setDate(showEndDate.getDate() + 3);

      const showData = {
        name: `Delete Test Show ${Date.now()}`,
        type: 'conformation',
        start_date: showStartDate.toISOString().split('T')[0],
        end_date: showEndDate.toISOString().split('T')[0],
        status: 'draft'
      };

      const { data: createdShow, error: showError } = await createShow(showData);
      if (showError || !createdShow) {
        return { success: false, error: showError?.message || 'Failed to create show' };
      }

      // Create a trial
      const trialData = {
        show_id: createdShow.id,
        name: `Delete Test Trial ${Date.now()}`,
        date: showStartDate.toISOString().split('T')[0],
        trial_number: 'T1',
        status: 'planned'
      };

      const { data: createdTrial, error: createError } = await createTrial(trialData);
      if (createError || !createdTrial) {
        await deleteShow(createdShow.id);
        return { success: false, error: createError?.message || 'Failed to create trial' };
      }

      const trialId = createdTrial.id;

      // Delete the trial
      const { error: deleteError } = await deleteTrial(trialId);

      // Clean up show
      await deleteShow(createdShow.id);

      if (deleteError) {
        return { success: false, error: deleteError.message };
      }

      // Verify deletion
      const { data: fetchedTrial, error: fetchError } = await getTrialById(trialId);

      return {
        success: true,
        trialId,
        trialDeleted: !fetchedTrial || !!fetchError
      };
    });

    console.log('Trial delete result:', result);
    expect(result.success).toBe(true);
    expect(result.trialDeleted).toBe(true);
  });

  test('should get trials by show ID', async ({ page }) => {
    console.log('=== Testing Get Trials By Show ===');

    // Sign in as admin (required for RLS write permissions)
    await testSetup.signIn('admin');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async () => {
      const { createShow, deleteShow } = await import('/src/services/database/queries/showQueries.ts');
      const { createTrial, deleteTrial, getTrialsByShow } = await import('/src/services/database/queries/trialQueries.ts');

      // Create a show
      const showStartDate = new Date();
      showStartDate.setDate(showStartDate.getDate() + 120);
      const showEndDate = new Date(showStartDate);
      showEndDate.setDate(showEndDate.getDate() + 3);

      const showData = {
        name: `Query Test Show ${Date.now()}`,
        type: 'conformation',
        start_date: showStartDate.toISOString().split('T')[0],
        end_date: showEndDate.toISOString().split('T')[0],
        status: 'draft'
      };

      const { data: createdShow, error: showError } = await createShow(showData);
      if (showError || !createdShow) {
        return { success: false, error: showError?.message || 'Failed to create show' };
      }

      // Create two trials for this show
      const trial1 = {
        show_id: createdShow.id,
        name: 'Trial Day 1',
        date: showStartDate.toISOString().split('T')[0],
        trial_number: 'T1',
        status: 'planned'
      };

      const trial2Date = new Date(showStartDate);
      trial2Date.setDate(trial2Date.getDate() + 1);
      const trial2 = {
        show_id: createdShow.id,
        name: 'Trial Day 2',
        date: trial2Date.toISOString().split('T')[0],
        trial_number: 'T2',
        status: 'planned'
      };

      const { data: t1 } = await createTrial(trial1);
      const { data: t2 } = await createTrial(trial2);

      // Get trials by show ID
      const { data: trials, error: queryError } = await getTrialsByShow(createdShow.id);

      // Clean up
      if (t1?.id) await deleteTrial(t1.id);
      if (t2?.id) await deleteTrial(t2.id);
      await deleteShow(createdShow.id);

      if (queryError) {
        return { success: false, error: queryError.message };
      }

      return {
        success: true,
        showId: createdShow.id,
        trialsCount: trials?.length || 0,
        foundTrials: trials?.map((t: { name: string }) => t.name) || []
      };
    });

    console.log('Get trials by show result:', result);
    expect(result.success).toBe(true);
    expect(result.trialsCount).toBe(2);
  });
});
