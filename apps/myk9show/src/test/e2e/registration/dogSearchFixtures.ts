import type { Page, Route } from '@playwright/test';

export interface DogSearchFixture {
  searchTerm: string;
  id: string;
  name: string;
  breed: string;
  ownerId: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;
  registrationNumber: string;
}

export const RANGER_DOG_SEARCH_FIXTURE: DogSearchFixture = {
  searchTerm: 'ranger',
  id: 'dededede-0000-0000-0000-000000000042',
  name: 'Ranger',
  breed: 'German Shepherd Dog',
  ownerId: 'dededede-0000-0000-0000-000000000101',
  ownerFirstName: 'Test',
  ownerLastName: 'Exhibitor',
  ownerEmail: 'exhibitor@myk9t.com',
  registrationNumber: 'SRRANGER42',
};

export const WILLOW_DOG_SEARCH_FIXTURE: DogSearchFixture = {
  searchTerm: 'willow',
  id: 'dededede-0000-0000-0000-000000000041',
  name: 'Willow',
  breed: 'Labrador Retriever',
  ownerId: 'dededede-0000-0000-0000-000000000101',
  ownerFirstName: 'Test',
  ownerLastName: 'Exhibitor',
  ownerEmail: 'exhibitor@myk9t.com',
  registrationNumber: 'SRWILLOW41',
};

export const COOPER_DOG_SEARCH_FIXTURE: DogSearchFixture = {
  searchTerm: 'cooper',
  id: 'dededede-0000-0000-0000-000000000046',
  name: 'Cooper',
  breed: 'Beagle',
  ownerId: 'dededede-0000-0000-0000-000000000102',
  ownerFirstName: 'Test',
  ownerLastName: 'Secretary',
  ownerEmail: 'secretary@myk9t.com',
  registrationNumber: 'SRCOOPER46',
};

const SEARCH_QUERY_MARKER = 'or=';

function registrationRow(fixture: DogSearchFixture) {
  return {
    id: `${fixture.id}-akc-registration`,
    dog_id: fixture.id,
    organization: 'AKC (American Kennel Club)',
    registration_number: fixture.registrationNumber,
    registered_name: `${fixture.name} Registered Name`,
    breed: fixture.breed,
    status: 'Active',
    is_primary: true,
  };
}

function dogRow(fixture: DogSearchFixture) {
  return {
    id: fixture.id,
    name: fixture.name,
    call_name: fixture.name,
    breed: fixture.breed,
    sex: 'female',
    date_of_birth: '2021-03-14',
    color: 'Black',
    status: 'active',
    deleted_at: null,
    owner_id: fixture.ownerId,
    owner: {
      id: fixture.ownerId,
      first_name: fixture.ownerFirstName,
      last_name: fixture.ownerLastName,
      email: fixture.ownerEmail,
      phone: null,
    },
    registrations: [registrationRow(fixture)],
  };
}

function matchingFixture(url: string, fixtures: readonly DogSearchFixture[]) {
  const normalizedUrl = decodeURIComponent(url).toLowerCase();
  if (!normalizedUrl.includes(SEARCH_QUERY_MARKER)) return undefined;
  return fixtures.find(fixture => normalizedUrl.includes(fixture.searchTerm.toLowerCase()));
}

/**
 * Make only the searched dogs and their registrations deterministic. The real
 * roster response is preserved and augmented only when it lacks one of these
 * searched fixtures, while class/show reads and all writes continue through
 * production routes.
 */
export async function installDogSearchFixtures(
  page: Page,
  fixtures: readonly DogSearchFixture[]
): Promise<void> {
  await page.route('**/rest/v1/dog_registrations**', async (route: Route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }

    const fixture = matchingFixture(route.request().url(), fixtures);
    if (!fixture) {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([registrationRow(fixture)]),
    });
  });

  await page.route('**/rest/v1/dogs**', async (route: Route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }

    const normalizedUrl = decodeURIComponent(route.request().url()).toLowerCase();
    const fixture = matchingFixture(route.request().url(), fixtures);
    const isReplicationSync = normalizedUrl.includes('updated_at=gt.');
    const isRosterRead = normalizedUrl.includes('owner:people');
    if ((isReplicationSync || isRosterRead) && !normalizedUrl.includes(SEARCH_QUERY_MARKER)) {
      const response = await route.fetch();
      const body = (await response.json()) as Array<Record<string, unknown>>;
      const existingIds = new Set(body.map(row => row.id));
      const missingFixtures = fixtures
        .filter(searchFixture => !existingIds.has(searchFixture.id))
        .map(dogRow);
      await route.fulfill({ response, body: JSON.stringify([...body, ...missingFixtures]) });
      return;
    }
    if (!fixture) {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([dogRow(fixture)]),
    });
  });
}
