// The full confirmation (MYK9-1999): one email per exhibitor per show, sent by the scheduled run
// once her entry is accepted and its armband exists. Card and mail-in entries alike; the secretary
// sets no date and presses nothing. Deno-free so vitest can import it.
//
// The marker is per entry (entries.confirmation_email_*): an entry is confirmed once. An entry
// accepted after her others were confirmed is not yet stamped, so it brings a second full
// confirmation, which lists every accepted entry she has in the show.

/** Accepted, and every state an accepted entry moves on to on show day. */
export const ACCEPTED_ENTRY_STATUSES = [
  'confirmed',
  'checked-in',
  'at-gate',
  'in-ring',
  'competing',
  'completed',
] as const;

/** A show that is published. Nothing is sent for a draft or a cancelled show. */
export const SENDABLE_SHOW_STATUSES = ['published', 'upcoming', 'in_progress'] as const;

/** Exhibitors confirmed per scheduled run; the rest wait for the next run. */
export const FULL_CONFIRMATION_MAX_GROUPS = 40;

export interface ConfirmationEntryRow {
  id: string;
  show_id: string | null;
  class_id: string | null;
  trial_id: string | null;
  registration_id: string | null;
  armband: string | null;
  entry_fee: number | string | null;
  entry_status: string | null;
  check_in_status: string | null;
  confirmation_email_sent_at: string | null;
  confirmation_email_status: string | null;
  dog: {
    name?: string | null;
    call_name?: string | null;
    breed?: string | null;
    sex?: string | null;
    owner_id?: string | null;
  } | null;
  class: { name?: string | null; level?: string | null; element?: string | null } | null;
  registration: { handler_id?: string | null } | null;
}

/** An entry she is in the show with: accepted, not pulled, with its armband. */
export function isLiveAcceptedEntry(entry: ConfirmationEntryRow): boolean {
  return (
    (ACCEPTED_ENTRY_STATUSES as readonly string[]).includes(entry.entry_status ?? '') &&
    entry.check_in_status !== 'pulled' &&
    !!entry.armband?.trim()
  );
}

/** An accepted entry whose full confirmation has not gone and is not given up on. */
export function isDueForConfirmation(entry: ConfirmationEntryRow): boolean {
  return (
    isLiveAcceptedEntry(entry) &&
    !entry.confirmation_email_sent_at &&
    entry.confirmation_email_status === 'pending'
  );
}

/**
 * Who the email goes to: the person on the entry form (enrollments.handler_id, the same person
 * the receipt went to), else the dog's owner (a card entry has no entry form).
 */
export function confirmationRecipientId(entry: ConfirmationEntryRow): string | null {
  return entry.registration?.handler_id ?? entry.dog?.owner_id ?? null;
}

export interface ConfirmationGroup {
  showId: string;
  personId: string;
  /** The due entries this email confirms (and stamps). */
  dueEntryIds: string[];
}

/**
 * One group per exhibitor per show among the due entries, oldest first as read, capped. An entry
 * with no show or no recipient person cannot be grouped and is returned in `unaddressed`.
 */
export function groupDueConfirmations(
  entries: ConfirmationEntryRow[],
  maxGroups: number = FULL_CONFIRMATION_MAX_GROUPS
): { groups: ConfirmationGroup[]; unaddressed: string[] } {
  const groups = new Map<string, ConfirmationGroup>();
  const unaddressed: string[] = [];
  for (const entry of entries) {
    if (!isDueForConfirmation(entry)) continue;
    const personId = confirmationRecipientId(entry);
    if (!entry.show_id || !personId) {
      unaddressed.push(entry.id);
      continue;
    }
    const key = `${entry.show_id}:${personId}`;
    const group = groups.get(key);
    if (group) group.dueEntryIds.push(entry.id);
    else if (groups.size < maxGroups) {
      groups.set(key, { showId: entry.show_id, personId, dueEntryIds: [entry.id] });
    }
  }
  return { groups: [...groups.values()], unaddressed };
}

/** Her entries the email lists: every live accepted entry she has in the show, by trial then class. */
export function entriesListedFor(
  showEntries: ConfirmationEntryRow[],
  personId: string,
  trialOrder: Map<string, number>
): ConfirmationEntryRow[] {
  return showEntries
    .filter(entry => isLiveAcceptedEntry(entry) && confirmationRecipientId(entry) === personId)
    .sort(
      (a, b) =>
        (trialOrder.get(a.trial_id ?? '') ?? 0) - (trialOrder.get(b.trial_id ?? '') ?? 0) ||
        (a.dog?.name ?? '').localeCompare(b.dog?.name ?? '') ||
        (a.class?.name ?? '').localeCompare(b.class?.name ?? '') ||
        a.id.localeCompare(b.id)
    );
}

/**
 * Resend's Idempotency-Key for one full confirmation: the show, the person and the exact entries
 * it confirms. A retry of the same set is the same message; a later entry is a new one.
 */
export async function fullConfirmationIdempotencyKey(group: ConfirmationGroup): Promise<string> {
  const ids = [...group.dueEntryIds].sort().join(',');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ids));
  const hex = [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
  return `full-confirmation-${group.showId}-${group.personId}-${hex}`;
}

/** "Vesper", "Vesper and Juniper", "Vesper, Juniper and Rocket". */
export function joinDogNames(names: string[]): string {
  const unique = [...new Set(names.filter(Boolean))];
  if (unique.length <= 1) return unique[0] ?? 'your dog';
  return `${unique.slice(0, -1).join(', ')} and ${unique[unique.length - 1]}`;
}

// ─── Registry wording ─────────────────────────────────────────────────────────
// Mirrors memberClubLanguage and licenseLanguage in apps/myk9show/src/features/registries
// (akc.ts, ukc.ts, asca.ts); fullConfirmation.test.ts fails when they drift. Deno cannot import
// the app module. An unknown or blank registry falls back to AKC, as getTrialRegistry does.

const REGISTRY_WORDING = {
  AKC: {
    memberClubLanguage: 'A member club of the American Kennel Club',
    licenseLanguage: 'An A.K.C. Licensed Trial',
  },
  UKC: {
    memberClubLanguage: 'Held under the Official Rules and Regulations of the United Kennel Club',
    licenseLanguage: 'A UKC Licensed Nosework Trial',
  },
  ASCA: {
    memberClubLanguage: 'Sanctioned by The Australian Shepherd Club of America',
    licenseLanguage: 'An ASCA Sanctioned Scent Detection Trial',
  },
} as const;

export type RegistryWording = (typeof REGISTRY_WORDING)[keyof typeof REGISTRY_WORDING];

export function registryWording(registryId: string | null | undefined): RegistryWording {
  const id = registryId?.trim() as keyof typeof REGISTRY_WORDING | undefined;
  return (id && REGISTRY_WORDING[id]) || REGISTRY_WORDING.AKC;
}

export const REGISTRY_WORDING_FOR_TEST = REGISTRY_WORDING;
