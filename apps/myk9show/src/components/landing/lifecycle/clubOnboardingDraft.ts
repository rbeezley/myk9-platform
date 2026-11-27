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
//
// Each draft lives under its own key (prefix + id), so two flows in one browser
// never overwrite or clear each other. Every save and read sweeps the entries
// older than the max age, so contact details do not linger.

const KEY_PREFIX = 'myk9:club-onboarding-draft:';
/** The single key drafts were kept under before each had its own; removed on sight. */
const LEGACY_KEY = 'myk9:club-onboarding-draft';

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

/** The keys of every club draft in storage, collected first so removing one cannot skip another. */
function draftKeys(): string[] {
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(KEY_PREFIX)) keys.push(key);
  }
  return keys;
}

/** Removes the legacy key and every draft that is stale, unreadable or malformed. */
function sweepStaleDrafts(): void {
  localStorage.removeItem(LEGACY_KEY);
  const now = Date.now();
  for (const key of draftKeys()) {
    let keep = false;
    try {
      keep = parseStored(JSON.parse(localStorage.getItem(key) ?? 'null'), now) !== null;
    } catch {
      keep = false;
    }
    if (!keep) localStorage.removeItem(key);
  }
}

/**
 * Saves the draft and returns its id (carry it in the form's address), or null when storage is
 * blocked. `currentId` is the id already in the form's address: a second submit from the same
 * flow (Back from sign-in, edit, submit) overwrites that draft instead of leaving an older copy
 * an earlier link could restore (MYK9-2501). The id is reused only while its draft is still
 * stored (the sweep has just dropped stale ones): an old link whose draft expired or was
 * cleared, or an id this device never saved, gets a new id, so it can never restore what the
 * next person types.
 */
export function saveClubOnboardingDraft(
  draft: ClubOnboardingDraft,
  currentId?: string | null
): string | null {
  try {
    sweepStaleDrafts();
    const reuse = currentId && localStorage.getItem(KEY_PREFIX + currentId) !== null;
    const id = reuse ? currentId : crypto.randomUUID();
    localStorage.setItem(KEY_PREFIX + id, JSON.stringify({ id, savedAt: Date.now(), draft }));
    return id;
  } catch {
    // Storage can be blocked; the visitor simply retypes the form.
    return null;
  }
}

/** The draft saved under `id`; no id, or an id nothing was saved under, gets null. */
export function readClubOnboardingDraft(id: string | null | undefined): ClubOnboardingDraft | null {
  try {
    sweepStaleDrafts();
    if (!id) return null;
    const raw = localStorage.getItem(KEY_PREFIX + id);
    if (!raw) return null;
    const stored = parseStored(JSON.parse(raw), Date.now());
    return stored && stored.id === id ? stored.draft : null;
  } catch {
    return null;
  }
}

/** Removes only the draft saved under `id`; another flow's draft stays. */
export function clearClubOnboardingDraft(id: string | null | undefined): void {
  if (!id) return;
  try {
    localStorage.removeItem(KEY_PREFIX + id);
  } catch {
    // Nothing to clear.
  }
}

/** Removes every club draft on this device (sign-out: the next person on a shared computer). */
export function clearAllClubOnboardingDrafts(): void {
  try {
    localStorage.removeItem(LEGACY_KEY);
    for (const key of draftKeys()) localStorage.removeItem(key);
  } catch {
    // Nothing to clear.
  }
}
