import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';

test.describe('Class CRUD Operations', () => {
  let testSetup: TestSetup;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
  });

  test('should query classes from Supabase database (READ - no auth)', async ({ page }) => {
    console.log('=== Testing Class Read (No Auth) ===');

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const dbResult = await page.evaluate(async () => {
      const { getAllClasses } = await import('/src/services/database/queries/classQueries.ts');

      const { data, error } = await getAllClasses();

      if (error) {
        return { success: false, error: error.message, count: 0, classes: [] };
      }

      return {
        success: true,
        count: data?.length || 0,
        classes: data?.slice(0, 5).map(c => ({ id: c.id, name: c.name })) || []
      };
    });

    console.log('Database query result:', dbResult);
    expect(dbResult.success).toBe(true);
    expect(dbResult.count).toBeGreaterThanOrEqual(0);
  });

  test('should create a new class in database (CREATE)', async ({ page }) => {
    console.log('=== Testing Class Create ===');

    // Sign in as admin (required for RLS write permissions)
    await testSetup.signIn('admin');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async () => {
      const { createShow, deleteShow } = await import('/src/services/database/queries/showQueries.ts');
      const { createTrial, deleteTrial } = await import('/src/services/database/queries/trialQueries.ts');
      const { createClass, deleteClass } = await import('/src/services/database/queries/classQueries.ts');

      // First create a show
      const showStartDate = new Date();
      showStartDate.setDate(showStartDate.getDate() + 30);
      const showEndDate = new Date(showStartDate);
      showEndDate.setDate(showEndDate.getDate() + 3);

      const showData = {
        name: `Test Show for Class ${Date.now()}`,
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
        name: `Test Trial for Class ${Date.now()}`,
        date: showStartDate.toISOString().split('T')[0],
        trial_number: 'T1',
        status: 'planned'
      };

      const { data: createdTrial, error: trialError } = await createTrial(trialData);
      if (trialError || !createdTrial) {
        await deleteShow(createdShow.id);
        return { success: false, error: trialError?.message || 'Failed to create trial' };
      }

      // Create a class for this trial
      const classData = {
        trial_id: createdTrial.id,
        name: `E2E Test Class ${Date.now()}`,
        level: 'Novice',
        status: 'no-status'
      };

      const { data: createdClass, error: classError } = await createClass(classData);

      // Clean up
      if (createdClass?.id) {
        await deleteClass(createdClass.id);
      }
      await deleteTrial(createdTrial.id);
      await deleteShow(createdShow.id);

      if (classError) {
        return { success: false, error: classError.message };
      }

      return {
        success: true,
        classId: createdClass?.id,
        className: createdClass?.name,
        trialId: createdTrial.id
      };
    });

    console.log('Class create result:', result);
    expect(result.success).toBe(true);
    expect(result.classId).toBeTruthy();
    expect(result.className).toContain('E2E Test Class');
  });

  test('should update an existing class in database (UPDATE)', async ({ page }) => {
    console.log('=== Testing Class Update ===');

    await testSetup.signIn('admin');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async () => {
      const { createShow, deleteShow } = await import('/src/services/database/queries/showQueries.ts');
      const { createTrial, deleteTrial } = await import('/src/services/database/queries/trialQueries.ts');
      const { createClass, updateClass, deleteClass } = await import('/src/services/database/queries/classQueries.ts');

      // Create show
      const showStartDate = new Date();
      showStartDate.setDate(showStartDate.getDate() + 30);
      const showEndDate = new Date(showStartDate);
      showEndDate.setDate(showEndDate.getDate() + 3);

      const { data: createdShow, error: showError } = await createShow({
        name: `Update Test Show ${Date.now()}`,
        type: 'conformation',
        start_date: showStartDate.toISOString().split('T')[0],
        end_date: showEndDate.toISOString().split('T')[0],
        status: 'draft'
      });

      if (showError || !createdShow) {
        return { success: false, error: showError?.message || 'Failed to create show' };
      }

      // Create trial
      const { data: createdTrial, error: trialError } = await createTrial({
        show_id: createdShow.id,
        name: `Update Test Trial ${Date.now()}`,
        date: showStartDate.toISOString().split('T')[0],
        trial_number: 'T1',
        status: 'planned'
      });

      if (trialError || !createdTrial) {
        await deleteShow(createdShow.id);
        return { success: false, error: trialError?.message || 'Failed to create trial' };
      }

      // Create class
      const { data: createdClass, error: classError } = await createClass({
        trial_id: createdTrial.id,
        name: `Update Test Class ${Date.now()}`,
        level: 'Novice',
        status: 'no-status'
      });

      if (classError || !createdClass) {
        await deleteTrial(createdTrial.id);
        await deleteShow(createdShow.id);
        return { success: false, error: classError?.message || 'Failed to create class' };
      }

      // Update the class
      const { data: updatedClass, error: updateError } = await updateClass(createdClass.id, {
        level: 'Open',
        description: 'Updated description'
      });

      // Clean up
      await deleteClass(createdClass.id);
      await deleteTrial(createdTrial.id);
      await deleteShow(createdShow.id);

      if (updateError) {
        return { success: false, error: updateError.message };
      }

      return {
        success: true,
        originalLevel: 'Novice',
        updatedLevel: updatedClass?.level,
        levelMatches: updatedClass?.level === 'Open'
      };
    });

    console.log('Class update result:', result);
    expect(result.success).toBe(true);
    expect(result.levelMatches).toBe(true);
  });

  test('should delete a class from database (DELETE)', async ({ page }) => {
    console.log('=== Testing Class Delete ===');

    await testSetup.signIn('admin');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async () => {
      const { createShow, deleteShow } = await import('/src/services/database/queries/showQueries.ts');
      const { createTrial, deleteTrial } = await import('/src/services/database/queries/trialQueries.ts');
      const { createClass, deleteClass, getClassById } = await import('/src/services/database/queries/classQueries.ts');

      // Create show
      const showStartDate = new Date();
      showStartDate.setDate(showStartDate.getDate() + 30);
      const showEndDate = new Date(showStartDate);
      showEndDate.setDate(showEndDate.getDate() + 3);

      const { data: createdShow, error: showError } = await createShow({
        name: `Delete Test Show ${Date.now()}`,
        type: 'conformation',
        start_date: showStartDate.toISOString().split('T')[0],
        end_date: showEndDate.toISOString().split('T')[0],
        status: 'draft'
      });

      if (showError || !createdShow) {
        return { success: false, error: showError?.message || 'Failed to create show' };
      }

      // Create trial
      const { data: createdTrial, error: trialError } = await createTrial({
        show_id: createdShow.id,
        name: `Delete Test Trial ${Date.now()}`,
        date: showStartDate.toISOString().split('T')[0],
        trial_number: 'T1',
        status: 'planned'
      });

      if (trialError || !createdTrial) {
        await deleteShow(createdShow.id);
        return { success: false, error: trialError?.message || 'Failed to create trial' };
      }

      // Create class
      const { data: createdClass, error: classError } = await createClass({
        trial_id: createdTrial.id,
        name: `Delete Test Class ${Date.now()}`,
        level: 'Novice',
        status: 'no-status'
      });

      if (classError || !createdClass) {
        await deleteTrial(createdTrial.id);
        await deleteShow(createdShow.id);
        return { success: false, error: classError?.message || 'Failed to create class' };
      }

      // Soft delete the class
      const { error: deleteError } = await deleteClass(createdClass.id);

      // Verify class is soft-deleted (should not be found by normal query)
      const { data: checkClass } = await getClassById(createdClass.id);

      // Clean up parent entities
      await deleteTrial(createdTrial.id);
      await deleteShow(createdShow.id);

      return {
        success: !deleteError,
        classId: createdClass.id,
        classDeleted: !checkClass,
        error: deleteError?.message
      };
    });

    console.log('Class delete result:', result);
    expect(result.success).toBe(true);
    expect(result.classDeleted).toBe(true);
  });

  test('should get classes by trial ID', async ({ page }) => {
    console.log('=== Testing Get Classes By Trial ===');

    await testSetup.signIn('admin');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async () => {
      const { createShow, deleteShow } = await import('/src/services/database/queries/showQueries.ts');
      const { createTrial, deleteTrial } = await import('/src/services/database/queries/trialQueries.ts');
      const { createClass, deleteClass, getClassesByTrialId } = await import('/src/services/database/queries/classQueries.ts');

      // Create show
      const showStartDate = new Date();
      showStartDate.setDate(showStartDate.getDate() + 30);
      const showEndDate = new Date(showStartDate);
      showEndDate.setDate(showEndDate.getDate() + 3);

      const { data: createdShow, error: showError } = await createShow({
        name: `Classes By Trial Test Show ${Date.now()}`,
        type: 'conformation',
        start_date: showStartDate.toISOString().split('T')[0],
        end_date: showEndDate.toISOString().split('T')[0],
        status: 'draft'
      });

      if (showError || !createdShow) {
        return { success: false, error: showError?.message || 'Failed to create show' };
      }

      // Create trial
      const { data: createdTrial, error: trialError } = await createTrial({
        show_id: createdShow.id,
        name: `Classes By Trial Test Trial ${Date.now()}`,
        date: showStartDate.toISOString().split('T')[0],
        trial_number: 'T1',
        status: 'planned'
      });

      if (trialError || !createdTrial) {
        await deleteShow(createdShow.id);
        return { success: false, error: trialError?.message || 'Failed to create trial' };
      }

      // Create two classes for this trial
      const class1Data = { trial_id: createdTrial.id, name: 'Class A', level: 'Novice', status: 'no-status' };
      const class2Data = { trial_id: createdTrial.id, name: 'Class B', level: 'Open', status: 'no-status' };

      const { data: class1 } = await createClass(class1Data);
      const { data: class2 } = await createClass(class2Data);

      // Get classes by trial ID
      const { data: classes, error: getError } = await getClassesByTrialId(createdTrial.id);

      // Clean up
      if (class1?.id) await deleteClass(class1.id);
      if (class2?.id) await deleteClass(class2.id);
      await deleteTrial(createdTrial.id);
      await deleteShow(createdShow.id);

      if (getError) {
        return { success: false, error: getError.message };
      }

      return {
        success: true,
        trialId: createdTrial.id,
        classesCount: classes?.length || 0,
        foundClasses: classes?.map(c => c.name) || []
      };
    });

    console.log('Get classes by trial result:', result);
    expect(result.success).toBe(true);
    expect(result.classesCount).toBe(2);
    expect(result.foundClasses).toContain('Class A');
    expect(result.foundClasses).toContain('Class B');
  });
});
