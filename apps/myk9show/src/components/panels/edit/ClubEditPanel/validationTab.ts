import { clubSchemas } from '@/lib/validation';
import type { FieldLocation } from '../usePanelValidationNavigation';

export type ClubTabValue = 'basic' | 'contact' | 'premium';

export const CLUB_TAB_ORDER: readonly ClubTabValue[] = ['basic', 'contact', 'premium'];

export const CLUB_TAB_LABEL: Record<ClubTabValue, string> = {
  basic: 'Basic Info',
  contact: 'Contact',
  premium: 'Premium',
};

/**
 * MYK9-891: the Create Club footer sits under every tab, so a user who finished
 * Basic Info took "Create Club" to mean "done" while the required Contact
 * fields were still blank. Maps each schema field to the tab that renders it
 * (and the id to focus) so a failed submit can move the user there and the tab
 * strip can say which sections still need attention. Same shape as the Add Dog
 * panel's validationTab (MYK9-885).
 */
export const FIELD_LOCATION: Record<string, FieldLocation<ClubTabValue>> = {
  name: { tab: 'basic', elementId: 'name' },
  clubNumber: { tab: 'basic', elementId: 'clubNumber' },
  description: { tab: 'basic', elementId: 'description' },
  founded: { tab: 'basic', elementId: 'founded' },
  clubType: { tab: 'basic', elementId: 'clubType' },
  // Logo is set through the Change Logo button; accentColor has no focusable id.
  logo: { tab: 'basic', elementId: 'club-logo-button' },
  email: { tab: 'contact', elementId: 'email' },
  phone: { tab: 'contact', elementId: 'phone' },
  website: { tab: 'contact', elementId: 'website' },
  street: { tab: 'contact', elementId: 'street' },
  city: { tab: 'contact', elementId: 'city' },
  state: { tab: 'contact', elementId: 'state' },
  zipCode: { tab: 'contact', elementId: 'zipCode' },
  country: { tab: 'contact', elementId: 'country' },
};

export const locateInvalidField = (field: string): FieldLocation<ClubTabValue> | undefined =>
  FIELD_LOCATION[field];

const emptyCounts = (): Record<ClubTabValue, number> => ({ basic: 0, contact: 0, premium: 0 });

/** Unresolved fields per tab (blank required or invalid) for the current form data. */
export function countInvalidFieldsByTab(
  data: Record<string, unknown>
): Record<ClubTabValue, number> {
  const counts = emptyCounts();
  const result = clubSchemas.basic.safeParse(data);
  if (result.success) return counts;
  const seen = new Set<string>();
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field !== 'string' || seen.has(field)) continue;
    seen.add(field);
    const location = FIELD_LOCATION[field];
    if (location) counts[location.tab] += 1;
  }
  return counts;
}

/** Number of fields with a VISIBLE error (touched or submitted) per tab. */
export function countVisibleErrorsByTab(
  errors: Record<string, string | undefined>
): Record<ClubTabValue, number> {
  const counts = emptyCounts();
  for (const [field, message] of Object.entries(errors)) {
    if (!message) continue;
    const location = FIELD_LOCATION[field];
    if (location) counts[location.tab] += 1;
  }
  return counts;
}
