import { CLUB_REGISTRY_ORGS, type ClubRegistryNumberInputs } from '@/utils/clubRegistryNumbers';

// A visitor who is not signed in fills the club form, is sent to sign in, and
// comes back to the same form with what she typed. It is cleared the moment the
// club request is sent, and on sign-out.
//
// MYK9-2469: it is kept in local storage, not session storage. A new account
// confirms its email from a link that opens a NEW tab, and session storage is
// per tab: the new tab found no draft, showed an empty form and sent her to
// person onboarding. A draft holds contact details, so it is only kept a day.

const KEY = 'myk9:club-onboarding-draft';

/** How long an unsent draft is kept, and keeps the first-run profile step waiting. */
export const CLUB_ONBOARDING_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

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

/** The stored envelope: the draft and when it was saved. Anything else, or too old, is no draft. */
function parseStored(value: unknown, now: number): ClubOnboardingDraft | null {
  if (typeof value !== 'object' || value === null) return null;
  const { savedAt, draft } = value as Record<string, unknown>;
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return null;
  const age = now - savedAt;
  if (age < 0 || age > CLUB_ONBOARDING_DRAFT_MAX_AGE_MS) return null;
  return parseDraft(draft);
}

export function saveClubOnboardingDraft(draft: ClubOnboardingDraft): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), draft }));
  } catch {
    // Storage can be blocked; the visitor simply retypes the form.
  }
}

export function readClubOnboardingDraft(): ClubOnboardingDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const draft = parseStored(JSON.parse(raw), Date.now());
    // A stale or malformed draft is removed, so its contact details do not linger.
    if (!draft) localStorage.removeItem(KEY);
    return draft;
  } catch {
    return null;
  }
}

export function clearClubOnboardingDraft(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
