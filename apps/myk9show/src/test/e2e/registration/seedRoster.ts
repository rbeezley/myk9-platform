import { expect, type Page } from '@playwright/test';

/**
 * Seed-derived facts the registration specs may rely on, and the two drift
 * traps that broke the whole sweep on 2026-09-15 (MYK9-545).
 *
 * Staging is shared and long-lived: `supabase/seed-demo.sql` resets the demo
 * shows, but the demo exhibitor's dog roster only grows — the seed's dog delete
 * is id-scoped, so every evidence replay that creates a dog through the UI
 * leaves it behind. A spec may therefore assert a FLOOR on the roster, never an
 * exact size.
 */

/**
 * Named dogs the seed gives `exhibitor@myk9t.com` (`seed-demo.sql` section 5:
 * Willow, Ranger, Juniper, Scout, Maple). Everything above this is walk debris,
 * plus the MYK9-109 load fixture's dogs when that opt-in file
 * (supabase/seed-load-fixture.sql) is applied, so this is the only number
 * about the roster that a reseed guarantees.
 */
export const SEEDED_EXHIBITOR_DOG_COUNT = 5;

/**
 * The CALL NAMES of those five dogs, which is what the UI renders:
 * `getDogDisplayName` returns `callName || name`, so the dog seeded as
 * "Juniper" appears as **Juni** and a selector written from the registered name
 * never matches. These are the names the picker labels as `Select <name>`.
 *
 * They are unique across the seeded roster, unlike the opt-in MYK9-109 load
 * fixture's (three of its dogs answer to "Birch"), so they are the only safe input to a
 * `getByRole('checkbox', { name })` locator — but only while no walk debris
 * shares one. A spec that needs a STRICT single match should say so; a spec
 * that only needs presence should take `.first()`.
 */
export const SEEDED_EXHIBITOR_DOG_NAMES = ['Willow', 'Ranger', 'Juni', 'Scout', 'Maple'] as const;

export interface SeededSearchDog {
  id: string;
  callName: string;
}

export const SEEDED_SEARCH_DOGS = {
  ranger: {
    id: 'dededede-0000-0000-0000-000000000042',
    callName: 'Ranger',
  },
  willow: {
    id: 'dededede-0000-0000-0000-000000000041',
    callName: 'Willow',
  },
  cooper: {
    id: 'dededede-0000-0000-0000-000000000046',
    callName: 'Cooper',
  },
} as const satisfies Record<string, SeededSearchDog>;

/** Search the real dog endpoint and fail with the missing seed identity. */
export async function searchForSeededDog(page: Page, dog: SeededSearchDog): Promise<void> {
  const responsePromise = page.waitForResponse(
    response =>
      response.url().includes('/rest/v1/dogs') &&
      response.request().method() === 'GET' &&
      decodeURIComponent(response.url()).toLowerCase().includes(dog.callName.toLowerCase()),
    { timeout: 10000 }
  );
  await page.getByPlaceholder(/Search all dogs/i).fill(dog.callName);
  const response = await responsePromise;
  // A failed request is a broken endpoint (auth, RLS, backend), not missing
  // seed data, so say which before reading the body as rows.
  expect(response.ok(), `dogs search ${response.status()}: ${await response.text()}`).toBe(true);
  const rows = (await response.json()) as Array<{ id: string; call_name?: string }>;
  // Target-neutral: this runs on shared staging and on the nightly isolated DB.
  expect(rows, `Seed drift: missing ${dog.callName} (${dog.id}) in /rest/v1/dogs search`).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: dog.id })])
  );
  const escapedName = dog.callName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await expect(
    page.getByRole('checkbox', { name: new RegExp(`^Select ${escapedName}$`, 'i') })
  ).toBeVisible({ timeout: 10000 });
}

/**
 * The demo show's entry window is `CURRENT_DATE - 16 .. + 76` (`seed-demo.sql`
 * section 2) — deliberately relative, so "today" is always inside it. A spec
 * that pinned `page.clock.setFixedTime(new Date('2026-05-15T12:00:00.000Z'))`
 * was therefore guaranteed to fall outside the window the moment staging was
 * reseeded after that date, and the exhibitor wizard rendered "This show is not
 * accepting online entries yet" instead of step 1.
 *
 * Returns the override when `QA_REGISTRATION_TIME` is set (a hand run pinning a
 * specific moment), and `null` otherwise, meaning "use real time" — which the
 * seed's relative window guarantees is inside the entry period *for the first
 * 76 days after a reseed*. Past that the whole sweep goes red with the same
 * "not accepting online entries yet" symptom; reseed rather than reaching for
 * the override, because `page.clock` fakes only the BROWSER clock and the
 * server's own entry-window guard still sees real time — a spec can then pass
 * on a show a real exhibitor cannot enter.
 *
 * Throws on a malformed value rather than handing `setFixedTime` an
 * `Invalid Date`, which fails deep inside Playwright with no mention of the
 * variable.
 */
export function registrationClockOverride(): Date | null {
  const override = process.env.QA_REGISTRATION_TIME;
  if (!override) return null;
  const parsed = new Date(override);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(
      `QA_REGISTRATION_TIME is not a parsable date: ${JSON.stringify(override)}. ` +
        'Use an ISO-8601 instant, e.g. 2026-09-16T12:00:00.000Z.'
    );
  }
  return parsed;
}

/**
 * Applies {@link registrationClockOverride} to a page, when one is set.
 */
export async function applyRegistrationClock(page: {
  clock: { setFixedTime(time: Date): Promise<void> };
}): Promise<void> {
  const override = registrationClockOverride();
  if (override) await page.clock.setFixedTime(override);
}
