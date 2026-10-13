import { test, expect, type Page, type Route } from '@playwright/test';
import { signInAsSecretary } from '../uat/shared/auth';
import { LIVE_REGISTRATION_SHOW_ID } from '../uat/shared/seededShows';
import { installSharedStagingWriteGuard } from '../helpers/sharedStagingWriteGuard';
import { applyRegistrationClock } from './seedRoster';

const SHOW_ID = LIVE_REGISTRATION_SHOW_ID;
const MAIL_IN_PERSON_ID = '11111111-1111-4111-8111-111111111111';
const MAIL_IN_DOG_ID = '22222222-2222-4222-8222-222222222222';
const MAIL_IN_REGISTRATION_ID = '33333333-3333-4333-8333-333333333333';

interface CapturedMailInWrites {
  person?: Record<string, unknown>;
  dog?: Record<string, unknown>;
  registration?: Record<string, unknown>;
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

  await page.route('**/rest/v1/rpc/create_dog_with_registrations', async route => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }

    const requestBody = route.request().postDataJSON() as {
      p_dog: Record<string, unknown>;
      p_registrations: Record<string, unknown>[];
    };
    captured.dog = requestBody.p_dog;
    captured.registration = requestBody.p_registrations[0];
    await fulfillJson(route, null);
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
  // The longest Quick Create journey: sign-in, Person (two tabs), Dog (three tabs),
  // the registration form, Review and Complete (MYK9-1120).
  test.setTimeout(90000);

  // MYK9-1120: every write below is answered by `captureMailInWrites`, so nothing
  // persists and the second Nightly pass after the isolated reset cannot collide
  // with this one. The guard is registered FIRST so those mocks take precedence
  // (Playwright matches routes newest-first); it is the second net that aborts
  // any write the mocks did not anticipate if this is ever pointed at shared
  // staging by hand. Against the isolated target it forwards untouched.
  await installSharedStagingWriteGuard(page, { strictRpcWrites: true });

  // MYK9-545: the seed's entry window is relative to the reseed date.
  await applyRegistrationClock(page);

  const captured: CapturedMailInWrites = {};
  await captureMailInWrites(page, captured);

  await signInAsSecretary(page, `/secretary/register/${SHOW_ID}`);
  await page.goto(`/secretary/register/${SHOW_ID}`, { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: 'Add entry for someone else' })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByRole('heading', { name: 'Select Dogs to Register' })).toBeVisible();

  await page.getByRole('button', { name: /Create New/i }).click();
  await page.getByRole('menuitem', { name: /Exhibitor & Dog/i }).click();

  // MYK9-1081: Quick Create is one slide-out; it opens on its Add Person view.
  const personDialog = page.getByRole('dialog', { name: 'Add Person' });
  await expect(personDialog).toBeVisible();
  await expect(page.getByText('Step 1 of 3: Add Person')).toBeVisible();

  await page.getByLabel(/First Name/i).fill('Molly');
  await page.getByLabel(/Last Name/i).fill('Mailbox');
  await page.getByLabel(/Email Address/i).fill('molly.mailbox@example.com');
  // MYK9-931: Add Person walks Basic Info -> Contact; Add Person is on the last tab.
  await page.getByRole('button', { name: /Next: Contact/ }).click();
  await page.getByLabel(/Phone Number/i).fill('555-1000');
  await page.getByLabel(/Street Address/i).fill('123 Paper Trail');
  await page.getByLabel(/City/i).fill('Envelope');
  await page.getByLabel(/State/i).fill('TX');
  await page.getByLabel(/ZIP Code/i).fill('75001');
  await personDialog.getByRole('button', { name: 'Add Person', exact: true }).click();

  // Back on the step screens: the panel is titled for the flow, not a form.
  const stepsDialog = page.getByRole('dialog', { name: 'Quick Registration Setup' });
  await expect(stepsDialog.getByRole('heading', { name: 'Add Dog(s)' })).toBeVisible();
  await stepsDialog.getByRole('button', { name: 'Add First Dog' }).click();
  // The same slide-out, titled for its Add Dog view.
  const dogDialog = page.getByRole('dialog', { name: 'Add Dog' });
  await expect(dogDialog).toBeVisible();

  await dogDialog.getByLabel(/Call Name/i).fill('Stamp');
  await dogDialog.getByRole('combobox').first().click();
  await page.getByRole('option', { name: /Female/i }).click();
  await dogDialog.getByLabel(/Date of Birth/i).fill('2020-01-15');
  // MYK9-545: Color & Markings is not on the Essential tab. `validation.ts`
  // says so out loud — it lives on the Optional details tab (AdditionalInfoTab),
  // and the spec was still filling it from Essential, where the field does not
  // exist. Switch tabs, fill, then continue on Registration.
  await dogDialog.getByRole('tab', { name: /Optional details/i }).click();
  await dogDialog.getByLabel(/Color & Markings/i).fill('Black and tan');

  await dogDialog.getByRole('tab', { name: /Registration/i }).click();
  await dogDialog.getByRole('button', { name: 'Add New Registration' }).click();
  // Still the one slide-out (MYK9-1081): the registration form replaces the dog
  // form inside it rather than stacking a second panel on top.
  const registrationDialog = page.getByRole('dialog', { name: 'Add New Registration' });
  await expect(registrationDialog).toBeVisible();
  await expect(page.locator('.slide-over-panel')).toHaveCount(1);

  await registrationDialog.getByRole('combobox').nth(0).click();
  await page.getByRole('option', { name: /AKC \(American Kennel Club\)/i }).click();
  await registrationDialog.getByLabel(/Registered Name/i).fill('Mailbox Special Delivery');
  await registrationDialog.getByLabel(/Registered Breed/i).click();
  await page.getByPlaceholder('Search breeds…').fill('Golden Retriever');
  // MYK9-545: the breed picker is a combobox + listbox now, not a button list.
  await page
    .getByRole('listbox', { name: 'Breeds' })
    .getByRole('option', { name: 'Golden Retriever' })
    .click();
  await registrationDialog.getByLabel(/Registration Number/i).fill('DN12345601');
  await registrationDialog.getByRole('button', { name: 'Save Registration' }).click();

  await expect(dogDialog.getByText('Mailbox Special Delivery')).toBeVisible();
  // MYK9-931: Add Dog only shows on the last tab; earlier tabs stay clickable.
  await dogDialog.getByRole('tab', { name: /Optional details/i }).click();
  await dogDialog.getByRole('button', { name: 'Add Dog', exact: true }).click();

  await expect(stepsDialog.getByRole('heading', { name: 'Dogs Added (1):' })).toBeVisible({
    timeout: 15000,
  });
  await stepsDialog.getByRole('button', { name: 'Review', exact: true }).click();
  await expect(stepsDialog.getByRole('heading', { name: 'Review & Complete' })).toBeVisible({
    timeout: 15000,
  });
  await expect(stepsDialog.getByText('Stamp', { exact: true }).first()).toBeVisible();
  await stepsDialog.getByRole('button', { name: 'Complete Setup' }).click();

  await expect(page.getByText('1 dog selected')).toBeVisible();
  expect(captured.person).toMatchObject({
    first_name: 'Molly',
    last_name: 'Mailbox',
    email: 'molly.mailbox@example.com',
  });
  expect(captured.person).not.toHaveProperty('auth_user_id');
  // MYK9-90 section 5.3 (migration 20260727110000): `dogs.name` is a legacy
  // display alias and is deliberately NOT written back — `toSupabaseRow` says so
  // out loud, because writing it would copy the call name into the legacy column
  // on every sync. The spec asserted the opposite and had never reached this
  // line (MYK9-545). Pin the documented shape instead.
  expect(captured.dog).toMatchObject({
    name: null,
    call_name: 'Stamp',
    owner_id: MAIL_IN_PERSON_ID,
  });
  expect(captured.registration).toMatchObject({
    organization: 'AKC (American Kennel Club)',
    registered_name: 'Mailbox Special Delivery',
    registration_number: 'DN12345601',
  });
});
