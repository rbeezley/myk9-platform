/**
 * MYK9-2255: the fields that count as contact details on a saved person.
 * One list for the people directory and the show-desk people rows, so a field
 * added here is removed from both at sign-out.
 */
export const SHARED_CONTACT_KEYS = [
  'email',
  'phone',
  'address',
  'city',
  'state',
  'zipCode',
] as const;

/** Contact fields only the directory's User shape has. */
export const DIRECTORY_ONLY_CONTACT_KEYS = ['streetAddress', 'emergencyContact'] as const;

export type SharedContactKey = (typeof SHARED_CONTACT_KEYS)[number];
