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
 * Willow, Ranger, Juniper, Scout, Maple). Everything above this is the MYK9-109
 * load fixture plus whatever a walk left behind, so this is the only number
 * about the roster that a reseed guarantees.
 */
export const SEEDED_EXHIBITOR_DOG_COUNT = 5;

/**
 * Seeded dogs whose call name is unique across the roster. The load fixture
 * repeats its call names (three dogs answer to "Birch"), so `Select <call name>`
 * is NOT a unique accessible name in general — only these are safe to drive a
 * `getByRole('checkbox', { name })` locator with.
 */
export const SEEDED_EXHIBITOR_DOG_NAMES = ['Willow', 'Ranger', 'Juni', 'Scout', 'Maple'] as const;

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
 * seed's relative window guarantees is inside the entry period.
 */
export function registrationClockOverride(): Date | null {
  const override = process.env.QA_REGISTRATION_TIME;
  return override ? new Date(override) : null;
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
