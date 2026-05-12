import { test, expect, type Page } from '@playwright/test';
import { TEST_USERS } from '../helpers/testUsers';

/**
 * feature-audit: authenticated dog service CRUD through the browser bundle.
 *
 * RLS assumptions:
 * - migration 147 restricts insert to owner/co-owner/secretary/admin.
 * - migration 162 lets secretary/club-admin/site-admin update dogs.
 * - soft_delete_dog RPC enforces the same ownership/elevated-role trust model.
 */

const SECRETARY_EMAIL = TEST_USERS.SECRETARY.email;
const SECRETARY_PASSWORD = TEST_USERS.SECRETARY.password;
const TEST_SECRETARY_EMAIL = 'secretary@myk9t.com';

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/sign-in', { waitUntil: 'networkidle' });
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('password-input').fill(password);
  await page.getByTestId('sign-in-button').click();
  await page.waitForURL(url => !url.pathname.includes('/sign-in'), { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

async function signInAsSecretary(page: Page) {
  await signIn(page, SECRETARY_EMAIL, SECRETARY_PASSWORD);
}

async function getSecretaryPersonId(page: Page): Promise<string> {
  const personId = await page.evaluate(async email => {
    const { supabase } = await import('/src/services/database/supabaseClient.ts');
    const { data, error } = await supabase.from('people').select('id').eq('email', email).single();

    if (error || !data) {
      throw new Error(error?.message || `No person found for ${email}`);
    }

    return data.id;
  }, TEST_SECRETARY_EMAIL);

  expect(personId).toMatch(/[0-9a-f-]{36}/);
  return personId;
}

test.describe('Dog CRUD Operations', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  test('reads visible dogs from Supabase database', async ({ page }) => {
    const ownerId = await getSecretaryPersonId(page);

    const dbResult = await page.evaluate(async personId => {
      const { getAllDogs } = await import('/src/services/database/dogs/index.ts');
      const { data, error } = await getAllDogs(personId, true);

      return {
        success: !error,
        error: error?.message,
        count: data?.length || 0,
        dogs: data?.slice(0, 5).map(d => ({ id: d.id, name: d.name })) || [],
      };
    }, ownerId);

    expect(dbResult.success).toBe(true);
    expect(dbResult.count).toBeGreaterThanOrEqual(0);
  });

  test('creates and soft-deletes a dog owned by the signed-in secretary', async ({ page }) => {
    const ownerId = await getSecretaryPersonId(page);
    const uniqueName = `E2E Service Create Dog ${Date.now()}`;

    const result = await page.evaluate(
      async ({ dogName, personId }) => {
        const { createDog, deleteDog, getDogById } =
          await import('/src/services/database/dogs/index.ts');

        const { data: createdDog, error: createError } = await createDog({
          owner_id: personId,
          name: dogName,
          breed: 'Golden Retriever',
          call_name: dogName,
          sex: 'female',
          date_of_birth: '2021-05-14',
        });

        if (createError || !createdDog) {
          return { success: false, error: createError?.message || 'Failed to create dog' };
        }

        const { error: deleteError } = await deleteDog(createdDog.id);
        const { data: deletedLookup } = await getDogById(createdDog.id);

        return {
          success: !deleteError,
          error: deleteError?.message,
          dogId: createdDog.id,
          dogName: createdDog.name,
          dogDeleted: !deletedLookup,
        };
      },
      { dogName: uniqueName, personId: ownerId }
    );

    expect(result.success).toBe(true);
    expect(result.dogId).toBeTruthy();
    expect(result.dogName).toBe(uniqueName);
    expect(result.dogDeleted).toBe(true);
  });

  test('updates an existing dog and persists changed fields', async ({ page }) => {
    const ownerId = await getSecretaryPersonId(page);
    const uniqueName = `E2E Service Update Dog ${Date.now()}`;

    const result = await page.evaluate(
      async ({ dogName, personId }) => {
        const { createDog, updateDog, deleteDog } =
          await import('/src/services/database/dogs/index.ts');

        const { data: createdDog, error: createError } = await createDog({
          owner_id: personId,
          name: dogName,
          breed: 'Labrador',
          call_name: dogName,
          sex: 'male',
        });

        if (createError || !createdDog) {
          return { success: false, error: createError?.message || 'Failed to create dog' };
        }

        const { data: updatedDog, error: updateError } = await updateDog(createdDog.id, {
          breed: 'Labrador Retriever',
          call_name: `${dogName} Updated`,
        });

        await deleteDog(createdDog.id);

        return {
          success: !updateError,
          error: updateError?.message,
          updatedCallName: updatedDog?.call_name,
          updatedBreed: updatedDog?.breed,
        };
      },
      { dogName: uniqueName, personId: ownerId }
    );

    expect(result.success).toBe(true);
    expect(result.updatedCallName).toBe(`${uniqueName} Updated`);
    expect(result.updatedBreed).toBe('Labrador Retriever');
  });
});
