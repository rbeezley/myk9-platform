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

function isLiveIdsRead(url: string): boolean {
  const query = new URL(url).searchParams;
  const keys = [...query.keys()];
  return (
    query.get('select')?.toLowerCase() === 'id' &&
    query.get('deleted_at')?.toLowerCase() === 'is.null' &&
    query.get('order')?.toLowerCase() === 'id.asc' &&
    query.get('limit') === '1000' &&
    keys.every(
      key =>
        key === 'select' ||
        key === 'deleted_at' ||
        key === 'order' ||
        key === 'limit' ||
        key === 'id'
    ) &&
    (!query.has('id') || query.get('id')?.toLowerCase().startsWith('gt.') === true)
  );
}

function liveIdsCursor(url: string): string | undefined {
  const value = new URL(url).searchParams.get('id');
  return value?.toLowerCase().startsWith('gt.') ? value.slice(3) : undefined;
}

function augmentLiveIdsPage(
  body: Array<Record<string, unknown>>,
  fixtures: readonly DogSearchFixture[],
  cursor: string | undefined,
  pageSize: number
): Array<Record<string, unknown>> {
  const existingIds = new Set(body.map(row => String(row.id)));
  const merged = [
    ...body,
    ...fixtures
      .filter(fixture => !existingIds.has(fixture.id))
      .filter(fixture => cursor === undefined || fixture.id > cursor)
      .map(fixture => ({ id: fixture.id })),
  ].sort((left, right) => {
    const leftId = String(left.id);
    const rightId = String(right.id);
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  });

  // Keep the server's page size. When a fixture belongs in a full page, the
  // displaced real row is returned by the next keyset request after the new
  // last cursor, so no real row is skipped and the cursor remains valid.
  return body.length >= pageSize ? merged.slice(0, pageSize) : merged;
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
    // The replicated dog read reconciles its local rows against a separate
    // select=id request. Keep searched fixtures in that live-id set too, or a
    // real staging response without the fixture removes it immediately after
    // the search has selected it.
    const isLiveIdsRequest = isLiveIdsRead(route.request().url());
    if (
      (isReplicationSync || isRosterRead || isLiveIdsRequest) &&
      !normalizedUrl.includes(SEARCH_QUERY_MARKER)
    ) {
      const response = await route.fetch();
      const body = (await response.json()) as Array<Record<string, unknown>>;
      const augmentedBody = isLiveIdsRequest
        ? augmentLiveIdsPage(body, fixtures, liveIdsCursor(route.request().url()), 1000)
        : [
            ...body,
            ...fixtures
              .filter(searchFixture => !body.some(row => row.id === searchFixture.id))
              .map(searchFixture => dogRow(searchFixture)),
          ];
      await route.fulfill({ response, body: JSON.stringify(augmentedBody) });
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
