/**
 * Serve a signed-in account's `exhibitor_profiles` row.
 *
 * Every account needs one, not only exhibitors, and for two separate reasons:
 *
 * - Without it `ExhibitorOnboardingChecker` redirects every signed-in
 *   exhibitor route to `/onboarding` (the exhibitor fixture's reason).
 * - `useCurrentPersonId` reads `person_id` off this row, and nothing else. A
 *   secretary is exempt from the redirect, so a missing row does not show as a
 *   redirect for them. Instead every person-keyed query stays disabled, and
 *   the dog roster reads as empty. The mail-in wizard then refused a dog it
 *   had just found: "All dogs in one registration must share the same owner."
 *
 * Staging lost both demo accounts' rows on 2026-09-20. The identity served
 * here is the account's REAL one (auth user and `people.id`), because the
 * fixture stands in for missing profile data, not for who is signed in.
 */
import type { Page } from '@playwright/test';
import { fulfillRows } from './postgrestRoute';

export interface AccountIdentity {
  /** `auth.users.id`, as `exhibitor_profiles.auth_user_id` stores it. */
  authUserId: string;
  /** `people.id`. Never equal to the auth uid (memory: people.id ≠ auth.uid()). */
  personId: string;
  /** Distinct per account so two installs never share a row id. */
  profileId: string;
  firstName: string;
  lastName: string;
  email: string;
}

const STAMP = '2026-01-01T00:00:00.000Z';

export async function installExhibitorProfile(page: Page, who: AccountIdentity): Promise<void> {
  // `onboarding_completed_at` is what `useExhibitorProfile` turns
  // `onboardingCompleted` on from; `person` mirrors the embed the query asks
  // for (`person:people!person_id(...)`).
  const row = {
    id: who.profileId,
    person_id: who.personId,
    auth_user_id: who.authUserId,
    onboarding_completed_at: STAMP,
    created_at: STAMP,
    updated_at: STAMP,
    person: {
      id: who.personId,
      first_name: who.firstName,
      last_name: who.lastName,
      email: who.email,
      phone: null,
      profile_image: null,
    },
  };
  await page.route('**/rest/v1/exhibitor_profiles*', route => fulfillRows(route, [row]));
}
