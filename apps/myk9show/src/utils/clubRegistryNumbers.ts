// MYK9-1235: a club's ID in each registry. AKC, UKC and ASCA each issue their
// own, and a club can hold more than one, so the number is stored per
// organization (club_registry_numbers), not as one free-text field.

export const CLUB_REGISTRY_ORGS = ['AKC', 'UKC', 'ASCA'] as const;

export type ClubRegistryOrg = (typeof CLUB_REGISTRY_ORGS)[number];

/** Only the organizations the club has a number for. */
export type ClubRegistryNumbers = Partial<Record<ClubRegistryOrg, string>>;

/** What a form holds: every organization's raw, untrimmed input. */
export type ClubRegistryNumberInputs = Record<ClubRegistryOrg, string>;

export const EMPTY_CLUB_REGISTRY_NUMBER_INPUTS: ClubRegistryNumberInputs = {
  AKC: '',
  UKC: '',
  ASCA: '',
};

export const CLUB_NUMBER_REQUIRED_MESSAGE = 'Enter at least one club number.';

export const CLUB_NUMBER_HELP_TEXT =
  "Your club's number from AKC, UKC or ASCA. Enter at least one.";

export const CLUB_NUMBER_LABEL: Record<ClubRegistryOrg, string> = {
  AKC: 'AKC club number',
  UKC: 'UKC club number',
  ASCA: 'ASCA club number',
};

/** Trim every value and drop the blanks. */
export function normalizeClubRegistryNumbers(
  input: Partial<Record<ClubRegistryOrg, string | null | undefined>> | null | undefined
): ClubRegistryNumbers {
  const result: ClubRegistryNumbers = {};
  for (const org of CLUB_REGISTRY_ORGS) {
    const value = input?.[org]?.trim();
    if (value) result[org] = value;
  }
  return result;
}

export function hasClubRegistryNumber(
  input: Partial<Record<ClubRegistryOrg, string | null | undefined>> | null | undefined
): boolean {
  return Object.keys(normalizeClubRegistryNumbers(input)).length > 0;
}

/** "AKC #123 · UKC #456", in AKC, UKC, ASCA order; empty when the club has none. */
export function formatClubRegistryNumbers(numbers: ClubRegistryNumbers | undefined): string {
  const normalized = normalizeClubRegistryNumbers(numbers);
  return CLUB_REGISTRY_ORGS.filter(org => normalized[org])
    .map(org => `${org} #${normalized[org]}`)
    .join(' · ');
}
