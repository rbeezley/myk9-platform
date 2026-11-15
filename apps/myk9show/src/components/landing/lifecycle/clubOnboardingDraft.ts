import { CLUB_REGISTRY_ORGS, type ClubRegistryNumberInputs } from '@/utils/clubRegistryNumbers';

// A visitor who is not signed in fills the club form, is sent to sign in, and
// comes back to the same form with what she typed. Session storage keeps it for
// this tab only and it is cleared the moment the club request is sent.

const KEY = 'myk9:club-onboarding-draft';

export interface ClubOnboardingDraft {
  clubName: string;
  organization: string;
  clubNumbers: ClubRegistryNumberInputs;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  firstShowDate: string;
  message: string;
}

const TEXT_FIELDS = [
  'clubName',
  'organization',
  'contactName',
  'contactEmail',
  'contactPhone',
  'firstShowDate',
  'message',
] as const;

/** A draft is only trusted when every field is a string and the numbers are strings by organization. */
function parseDraft(value: unknown): ClubOnboardingDraft | null {
  if (typeof value !== 'object' || value === null) return null;
  const draft = value as Record<string, unknown>;
  if (!TEXT_FIELDS.every(key => typeof draft[key] === 'string')) return null;
  const numbers = draft.clubNumbers;
  if (typeof numbers !== 'object' || numbers === null || Array.isArray(numbers)) return null;
  const numberMap = numbers as Record<string, unknown>;
  if (!CLUB_REGISTRY_ORGS.every(org => typeof numberMap[org] === 'string')) return null;
  return value as ClubOnboardingDraft;
}

export function saveClubOnboardingDraft(draft: ClubOnboardingDraft): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Storage can be blocked; the visitor simply retypes the form.
  }
}

export function readClubOnboardingDraft(): ClubOnboardingDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? parseDraft(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function clearClubOnboardingDraft(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
