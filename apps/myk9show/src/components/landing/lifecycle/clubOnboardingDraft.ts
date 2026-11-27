import { CLUB_REGISTRY_ORGS, type ClubRegistryNumberInputs } from '@/utils/clubRegistryNumbers';

// A visitor who is not signed in fills the club form, is sent to sign in, and
// comes back to the same form with what she typed. It is cleared the moment the
// club request is sent, and on sign-out.
//
// MYK9-2469: it is kept in local storage, not session storage. A new account
// confirms its email from a link that opens a NEW tab, and session storage is
// per tab: the new tab found no draft, showed an empty form and sent her to
// person onboarding. A draft holds contact details, so it is only kept a day.
//
// A draft is also tied to the flow that saved it: it carries a random id, the id
// rides in the club form's address through sign-up, the confirmation email and
// the callback, and it is restored only where the address carries the same id.
// On a shared computer the next visitor opens the form with no id and sees an
// empty form.

const KEY = 'myk9:club-onboarding-draft';

/** The query parameter that carries a saved draft's id in the club form's address. */
export const CLUB_DRAFT_PARAM = 'clubDraft';

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
function parseStored(
  value: unknown,
  now: number
): { id: string; draft: ClubOnboardingDraft } | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, savedAt, draft } = value as Record<string, unknown>;
  if (typeof id !== 'string' || !id) return null;
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return null;
  const age = now - savedAt;
  if (age < 0 || age > CLUB_ONBOARDING_DRAFT_MAX_AGE_MS) return null;
  const parsed = parseDraft(draft);
  return parsed ? { id, draft: parsed } : null;
}

/** Saves the draft and returns its id (carry it in the sign-in address), or null when storage is blocked. */
export function saveClubOnboardingDraft(draft: ClubOnboardingDraft): string | null {
  try {
    const id = crypto.randomUUID();
    localStorage.setItem(KEY, JSON.stringify({ id, savedAt: Date.now(), draft }));
    return id;
  } catch {
    // Storage can be blocked; the visitor simply retypes the form.
    return null;
  }
}

/** The saved draft, only when `id` is the id it was saved under; any other visitor gets null. */
export function readClubOnboardingDraft(id: string | null | undefined): ClubOnboardingDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const stored = parseStored(JSON.parse(raw), Date.now());
    // A stale or malformed draft is removed, so its contact details do not linger.
    if (!stored) {
      localStorage.removeItem(KEY);
      return null;
    }
    return id && stored.id === id ? stored.draft : null;
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
