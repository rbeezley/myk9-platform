import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';
import { createOwnedShowTeardown } from '../helpers/ownedShowTeardown';

type E2eResult = { success: boolean; [key: string]: unknown };

test.describe('Class CRUD Operations', () => {
  let testSetup: TestSetup;
  let ownedShows: ReturnType<typeof createOwnedShowTeardown>;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
    ownedShows = createOwnedShowTeardown();
  });

  test.afterEach(async ({ page }) => {
    await ownedShows.cleanup(page);
  });

  test('should query classes from Supabase database (READ - no auth)', async ({ page }) => {
    console.log('=== Testing Class Read (No Auth) ===');

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const dbResult = await page.evaluate(async () => {
      const { getAllClasses } = await import('/src/services/database/classes/index.ts');

      const { data, error } = await getAllClasses();

      if (error) {
        return { success: false, error: error.message, count: 0, classes: [] };
      }

      return {
        success: true,
        count: data?.length || 0,
        classes: data?.slice(0, 5).map(c => ({ id: c.id, name: c.name })) || [],
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

    const showStartDate = new Date();
    showStartDate.setDate(showStartDate.getDate() + 30);
    const showEndDate = new Date(showStartDate);
    showEndDate.setDate(showEndDate.getDate() + 3);
    const showData = {
      name: `Test Show for Class ${Date.now()}`,
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
              const { createClass } = await import('/src/services/database/classes/index.ts');
              const { data: createdTrial, error: trialError } = await createTrial({
                show_id: showId,
                name: `Test Trial for Class ${Date.now()}`,
                date,
                trial_number: 'T1',
                status: 'upcoming',
              });
              if (trialError || !createdTrial) {
                return { success: false, error: trialError?.message || 'Failed to create trial' };
              }

              const { data: createdClass, error: classError } = await createClass({
                trial_id: createdTrial.id,
                name: `E2E Test Class ${Date.now()}`,
                level: 'Novice',
                status: 'upcoming',
              });
              if (classError) return { success: false, error: classError.message };
              return {
                success: true,
                classId: createdClass?.id,
                className: createdClass?.name,
                trialId: createdTrial.id,
              };
            },
            { showId: createdShow.id, date: showStartDate.toISOString().split('T')[0] }
          );

    console.log('Class create result:', result);
    expect(result.success).toBe(true);
    expect(result.classId).toBeTruthy();
    expect(result.className).toContain('E2E Test Class');
  });

  test('should update an existing class in database (UPDATE)', async ({ page }) => {
    console.log('=== Testing Class Update ===');

    await testSetup.signIn('admin');
    await page.waitForLoadState('networkidle');

    const showStartDate = new Date();
    showStartDate.setDate(showStartDate.getDate() + 30);
    const showEndDate = new Date(showStartDate);
    showEndDate.setDate(showEndDate.getDate() + 3);
    const { data: createdShow, error: showError } = await ownedShows.create(page, {
      name: `Update Test Show ${Date.now()}`,
      organization: 'AKC',
      start_date: showStartDate.toISOString().split('T')[0],
      end_date: showEndDate.toISOString().split('T')[0],
      status: 'draft',
    });
    const result: E2eResult =
      showError || !createdShow
        ? { success: false, error: showError?.message || 'Failed to create show' }
        : await page.evaluate(
            async ({ showId, date }) => {
              const { createTrial } = await import('/src/services/database/trials/index.ts');
              const { createClass, updateClass } =
                await import('/src/services/database/classes/index.ts');
              const { data: createdTrial, error: trialError } = await createTrial({
                show_id: showId,
                name: `Update Test Trial ${Date.now()}`,
                date,
                trial_number: 'T1',
                status: 'upcoming',
              });
              if (trialError || !createdTrial) {
                return { success: false, error: trialError?.message || 'Failed to create trial' };
              }
              const { data: createdClass, error: classError } = await createClass({
                trial_id: createdTrial.id,
                name: `Update Test Class ${Date.now()}`,
                level: 'Novice',
                status: 'upcoming',
              });
              if (classError || !createdClass) {
                return { success: false, error: classError?.message || 'Failed to create class' };
              }

              const { data: updatedClass, error: updateError } = await updateClass(
                createdClass.id,
                {
                  level: 'Open',
                  description: 'Updated description',
                }
              );
              if (updateError) return { success: false, error: updateError.message };
              return {
                success: true,
                originalLevel: 'Novice',
                updatedLevel: updatedClass?.level,
                levelMatches: updatedClass?.level === 'Open',
              };
            },
            { showId: createdShow.id, date: showStartDate.toISOString().split('T')[0] }
          );

    console.log('Class update result:', result);
    expect(result.success).toBe(true);
    expect(result.levelMatches).toBe(true);
  });

  test('should delete a class from database (DELETE)', async ({ page }) => {
    console.log('=== Testing Class Delete ===');

    await testSetup.signIn('admin');
    await page.waitForLoadState('networkidle');

    const showStartDate = new Date();
    showStartDate.setDate(showStartDate.getDate() + 30);
    const showEndDate = new Date(showStartDate);
    showEndDate.setDate(showEndDate.getDate() + 3);
    const { data: createdShow, error: showError } = await ownedShows.create(page, {
      name: `Delete Test Show ${Date.now()}`,
      organization: 'AKC',
      start_date: showStartDate.toISOString().split('T')[0],
      end_date: showEndDate.toISOString().split('T')[0],
      status: 'draft',
    });
    const result: E2eResult =
      showError || !createdShow
        ? { success: false, error: showError?.message || 'Failed to create show' }
        : await page.evaluate(
            async ({ showId, date }) => {
              const { createTrial } = await import('/src/services/database/trials/index.ts');
              const { createClass, deleteClass, getClassById } =
                await import('/src/services/database/classes/index.ts');
              const { data: createdTrial, error: trialError } = await createTrial({
                show_id: showId,
                name: `Delete Test Trial ${Date.now()}`,
                date,
                trial_number: 'T1',
                status: 'upcoming',
              });
              if (trialError || !createdTrial) {
                return { success: false, error: trialError?.message || 'Failed to create trial' };
              }
              const { data: createdClass, error: classError } = await createClass({
                trial_id: createdTrial.id,
                name: `Delete Test Class ${Date.now()}`,
                level: 'Novice',
                status: 'upcoming',
              });
              if (classError || !createdClass) {
                return { success: false, error: classError?.message || 'Failed to create class' };
              }

              const { error: deleteError } = await deleteClass(createdClass.id);
              const { data: checkClass } = await getClassById(createdClass.id);
              return {
                success: !deleteError,
                classId: createdClass.id,
                classDeleted: !checkClass,
                error: deleteError?.message,
              };
            },
            { showId: createdShow.id, date: showStartDate.toISOString().split('T')[0] }
          );

    console.log('Class delete result:', result);
    expect(result.success).toBe(true);
    expect(result.classDeleted).toBe(true);
  });

  test('should get classes by trial ID', async ({ page }) => {
    console.log('=== Testing Get Classes By Trial ===');

    await testSetup.signIn('admin');
    await page.waitForLoadState('networkidle');

    const showStartDate = new Date();
    showStartDate.setDate(showStartDate.getDate() + 30);
    const showEndDate = new Date(showStartDate);
    showEndDate.setDate(showEndDate.getDate() + 3);
    const { data: createdShow, error: showError } = await ownedShows.create(page, {
      name: `Classes By Trial Test Show ${Date.now()}`,
      organization: 'AKC',
      start_date: showStartDate.toISOString().split('T')[0],
      end_date: showEndDate.toISOString().split('T')[0],
      status: 'draft',
    });
    const result: E2eResult =
      showError || !createdShow
        ? { success: false, error: showError?.message || 'Failed to create show' }
        : await page.evaluate(
            async ({ showId, date }) => {
              const { createTrial } = await import('/src/services/database/trials/index.ts');
              const { createClass, getClassesByTrialId } =
                await import('/src/services/database/classes/index.ts');
              const { data: createdTrial, error: trialError } = await createTrial({
                show_id: showId,
                name: `Classes By Trial Test Trial ${Date.now()}`,
                date,
                trial_number: 'T1',
                status: 'upcoming',
              });
              if (trialError || !createdTrial) {
                return { success: false, error: trialError?.message || 'Failed to create trial' };
              }
              await createClass({
                trial_id: createdTrial.id,
                name: 'Class A',
                level: 'Novice',
                status: 'upcoming',
              });
              await createClass({
                trial_id: createdTrial.id,
                name: 'Class B',
                level: 'Open',
                status: 'upcoming',
              });

              const { data: classes, error: getError } = await getClassesByTrialId(createdTrial.id);
              if (getError) return { success: false, error: getError.message };
              return {
                success: true,
                trialId: createdTrial.id,
                classesCount: classes?.length || 0,
                foundClasses: classes?.map(c => c.name) || [],
              };
            },
            { showId: createdShow.id, date: showStartDate.toISOString().split('T')[0] }
          );

    console.log('Get classes by trial result:', result);
    expect(result.success).toBe(true);
    expect(result.classesCount).toBe(2);
    expect(result.foundClasses).toContain('Class A');
    expect(result.foundClasses).toContain('Class B');
  });
});
