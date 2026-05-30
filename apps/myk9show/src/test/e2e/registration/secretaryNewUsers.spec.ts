import { test, expect, type Page, type Route } from '@playwright/test';
import { TEST_USERS } from '../helpers/testUsers';

const SHOW_ID = '4584f257-19b5-4016-aae6-5e7827b769cb';
const MAIL_IN_PERSON_ID = '11111111-1111-4111-8111-111111111111';
const MAIL_IN_DOG_ID = '22222222-2222-4222-8222-222222222222';
const MAIL_IN_REGISTRATION_ID = '33333333-3333-4333-8333-333333333333';

interface CapturedMailInWrites {
  person?: Record<string, unknown>;
  dog?: Record<string, unknown>;
  registration?: Record<string, unknown>;
}

async function signInAsSecretary(page: Page) {
  await page.goto('/sign-in', { waitUntil: 'networkidle' });
  await page.getByTestId('credential-input').fill(TEST_USERS.SECRETARY.email);
  await page.getByTestId('continue-button').click();
  await expect(page.getByTestId('password-input')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('password-input').fill(TEST_USERS.SECRETARY.password);
  await page.getByTestId('sign-in-button').click();
  await page.waitForURL(url => !url.pathname.includes('/sign-in'), { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function captureMailInWrites(page: Page, captured: CapturedMailInWrites) {
  await page.route('**/rest/v1/people**', async route => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }

    const requestBody = route.request().postDataJSON() as Record<string, unknown>[];
    captured.person = requestBody[0];
    await fulfillJson(
      route,
      {
        id: MAIL_IN_PERSON_ID,
        auth_user_id: null,
        first_name: captured.person.first_name,
        last_name: captured.person.last_name,
        email: captured.person.email,
        phone: captured.person.phone,
        street_address: captured.person.street_address,
        city: captured.person.city,
        state: captured.person.state,
        zip_code: captured.person.zip_code,
        profile_image: null,
      },
      201
    );
  });

  await page.route('**/rest/v1/dogs**', async route => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }

    const requestBody = route.request().postDataJSON() as Record<string, unknown>[];
    captured.dog = requestBody[0];
    await fulfillJson(
      route,
      {
        ...captured.dog,
        id: captured.dog.id ?? MAIL_IN_DOG_ID,
        owner_id: MAIL_IN_PERSON_ID,
        status: 'active',
        deleted_at: null,
        created_at: '2026-05-14T12:00:00.000Z',
        updated_at: '2026-05-14T12:00:00.000Z',
        owner: {
          id: MAIL_IN_PERSON_ID,
          first_name: 'Molly',
          last_name: 'Mailbox',
          email: 'molly.mailbox@example.com',
        },
        registrations: [],
      },
      201
    );
  });

  await page.route('**/rest/v1/dog_registrations**', async route => {
    if (route.request().method() === 'GET') {
      await fulfillJson(route, []);
      return;
    }

    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }

    const requestBody = route.request().postDataJSON() as Record<string, unknown>[];
    captured.registration = requestBody[0];
    await fulfillJson(
      route,
      {
        ...captured.registration,
        id: MAIL_IN_REGISTRATION_ID,
        created_at: '2026-05-14T12:00:00.000Z',
        updated_at: '2026-05-14T12:00:00.000Z',
      },
      201
    );
  });
}

test('secretary can create a mail-in exhibitor and dog without auth user creation', async ({
  page,
}) => {
  const captured: CapturedMailInWrites = {};
  await captureMailInWrites(page, captured);

  await signInAsSecretary(page);
  await page.goto(`/secretary/register/${SHOW_ID}`, { waitUntil: 'networkidle' });

  await expect(page.getByRole('heading', { name: 'Register for Show' })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByRole('heading', { name: 'Select Dogs to Register' })).toBeVisible();

  await page.getByRole('button', { name: /Create New/i }).click();
  await page.getByRole('menuitem', { name: /Exhibitor & Dog/i }).click();

  await expect(page.getByText('Quick Registration Setup')).toBeVisible();
  await expect(page.getByText('Create New Exhibitor').first()).toBeVisible();

  await page.getByLabel(/First Name/i).fill('Molly');
  await page.getByLabel(/Last Name/i).fill('Mailbox');
  await page.getByLabel(/Email Address/i).fill('molly.mailbox@example.com');
  await page.getByLabel(/Phone Number/i).fill('555-1000');
  await page.getByLabel(/Street Address/i).fill('123 Paper Trail');
  await page.getByLabel(/City/i).fill('Envelope');
  await page.getByLabel(/State/i).fill('TX');
  await page.getByLabel(/ZIP Code/i).fill('75001');
  await page.locator('button').filter({ hasText: 'Create Exhibitor' }).last().click();

  await expect(page.getByRole('heading', { name: 'Add Dog(s)' })).toBeVisible();
  await page.getByRole('button', { name: 'Add First Dog' }).click();
  const dogDialog = page.getByRole('dialog', { name: 'Add New Dog' });
  await expect(dogDialog).toBeVisible();

  await dogDialog.getByLabel(/Call Name/i).fill('Stamp');
  await dogDialog.getByRole('combobox').first().click();
  await page.getByRole('option', { name: /Female/i }).click();
  await dogDialog.getByLabel(/Date of Birth/i).fill('2020-01-15');
  await dogDialog.getByLabel(/Color & Markings/i).fill('Black and tan');

  await dogDialog.getByRole('tab', { name: /Registration/i }).click();
  await dogDialog.getByRole('button', { name: 'Add New Registration' }).click();
  const registrationDialog = page.getByRole('dialog', { name: 'Add New Registration' });
  await expect(registrationDialog).toBeVisible();

  await registrationDialog.getByRole('combobox').nth(0).click();
  await page.getByRole('option', { name: /AKC \(American Kennel Club\)/i }).click();
  await registrationDialog.getByLabel(/Registered Name/i).fill('Mailbox Special Delivery');
  await registrationDialog.getByRole('combobox').nth(1).click();
  await page.getByRole('option', { name: 'Golden Retriever' }).click();
  await registrationDialog.getByLabel(/Registration Number/i).fill('DN12345601');
  await registrationDialog.getByRole('button', { name: 'Save Registration' }).click();

  await expect(dogDialog.getByText('Mailbox Special Delivery')).toBeVisible();
  await dogDialog.getByRole('button', { name: 'Create Dog' }).click();

  await expect(page.getByRole('heading', { name: 'Dogs Added (1):' })).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByRole('heading', { name: 'Review & Complete' })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByText('Stamp', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Complete Setup' }).click();

  await expect(page.getByText('1 dog selected')).toBeVisible();
  expect(captured.person).toMatchObject({
    first_name: 'Molly',
    last_name: 'Mailbox',
    email: 'molly.mailbox@example.com',
  });
  expect(captured.person).not.toHaveProperty('auth_user_id');
  expect(captured.dog).toMatchObject({
    name: 'Stamp',
    call_name: 'Stamp',
    owner_id: MAIL_IN_PERSON_ID,
  });
  expect(captured.registration).toMatchObject({
    organization: 'AKC (American Kennel Club)',
    registered_name: 'Mailbox Special Delivery',
    registration_number: 'DN12345601',
  });
});
