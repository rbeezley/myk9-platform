import type { User as UserType } from '@/types/user-types';

/**
 * The person-update payload the secretary's edit panel sends, lifted out of
 * `UserDetailsView` (MYK9-570) so that file stops growing past the 500-line
 * limit and so the payload can be tested without rendering the page.
 *
 * It is hand-listed rather than a spread, deliberately: `Partial<User>` carries
 * derived and display-only fields (`name`, `dogs`, `roles`, sync metadata) that
 * must never reach a `people` UPDATE. The cost of that choice is that a NEW
 * column is silently dropped until it is named here — which is exactly what
 * happened to the junior handler fields in round 1 of this issue's review, and
 * why `userEditSavePayload.test.ts` pins the list.
 */
export function buildUserEditSavePayload(userData: Partial<UserType>): Partial<UserType> {
  const addressValue = userData.address || userData.streetAddress || '';
  return {
    ...(userData.firstName !== undefined && { firstName: userData.firstName }),
    ...(userData.lastName !== undefined && { lastName: userData.lastName }),
    ...(userData.email !== undefined && { email: userData.email }),
    ...(userData.phone !== undefined && { phone: userData.phone }),
    // Roles are managed via the user_roles table (RoleManager), not on people.
    address: addressValue,
    city: userData.city || '',
    state: userData.state || '',
    zipCode: userData.zipCode || '',
    // MYK9-570: the junior handler inputs. Both are optional on the form, so
    // both are forwarded only when the panel actually produced them.
    ...(userData.dateOfBirth !== undefined && { dateOfBirth: userData.dateOfBirth }),
    ...(userData.juniorHandlerNumbers !== undefined && {
      juniorHandlerNumbers: userData.juniorHandlerNumbers,
    }),
  };
}
