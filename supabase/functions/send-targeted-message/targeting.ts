export type TargetType = 'class' | 'checked_in' | 'all_show' | 'person';

export interface EntryContactSource {
  personId: string | null;
  authUserId: string | null;
  name: string;
  email: string | null;
}

export interface EntryRecipientSource {
  armband: string | null;
  authUserIds: Array<string | null | undefined>;
  // The same people as authUserIds (owner, co-owner, handler), with the fields an
  // email needs. Optional so push/inbox-only callers and fixtures stay unchanged.
  contacts?: EntryContactSource[];
}

export interface EntryPersonRow {
  id?: string | null;
  auth_user_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}

export const ENTRY_PERSON_FIELDS = 'id, auth_user_id, first_name, last_name, email';

export function contactFromPerson(
  person: EntryPersonRow | null | undefined
): EntryContactSource | null {
  if (!person) return null;
  const name = [person.first_name, person.last_name].filter(Boolean).join(' ').trim();
  return {
    personId: person.id ?? null,
    authUserId: person.auth_user_id ?? null,
    name: name || 'Unnamed exhibitor',
    email: person.email ?? null,
  };
}

export interface EmailRecipient {
  email: string;
  name: string;
}

export interface EmailAudience {
  recipients: EmailRecipient[];
  // People in the audience with no usable email address (none on file, or one that is
  // malformed), named so the secretary
  // can reach them another way. Never silently dropped.
  missing: string[];
}

export interface RingsideSessionSource {
  subscriptionId: string;
  role: 'exhibitor' | 'steward' | 'judge' | 'admin';
  favoritedArmbands: string[];
  lastSeenAt: string | null;
  lastSeenRoute: string | null;
}

export interface CallerRoleSource {
  club_id: string | null;
  show_id?: string | null;
  roles?: { name?: string | null } | null;
}

export const RINGSIDE_SESSION_PUSH_TARGET_SELECT =
  'subscription_id, role, favorited_armbands, last_seen_at, last_seen_route, push_subscriptions!inner(id, endpoint, p256dh, auth, user_id)';

// Columns for an entered account exhibitor's own push subscriptions. These are
// notified by their entry (auth_user_id) — no ringside session or favorited
// armband required, mirroring the inbox thread they already receive.
export const ACCOUNT_PUSH_SUBSCRIPTION_SELECT = 'id, endpoint, p256dh, auth, user_id';

export const CALLER_ROLE_SELECT =
  'id, club_id, show_id, auth_user_id, is_active, roles!inner(name)';

export function normalizeTargetType(value: unknown): TargetType {
  return value === 'checked_in' || value === 'all_show' || value === 'person' ? value : 'class';
}

// An entry as the recipient query returns it: the dog's owner and co-owner, and the handler.
export interface EntryPeopleRow {
  armband?: unknown;
  dog?: { owner?: EntryPersonRow | null; co_owner?: EntryPersonRow | null } | null;
  handler?: EntryPersonRow | null;
}

export function entryPeople(row: EntryPeopleRow): EntryPersonRow[] {
  return [row.dog?.owner, row.dog?.co_owner, row.handler].filter(
    (person): person is EntryPersonRow => !!person
  );
}

export function entrySource(row: EntryPeopleRow): EntryRecipientSource {
  return {
    armband: row.armband ? String(row.armband) : null,
    authUserIds: [
      row.dog?.owner?.auth_user_id,
      row.dog?.co_owner?.auth_user_id,
      row.handler?.auth_user_id,
    ],
    contacts: entryPeople(row)
      .map(contactFromPerson)
      .filter((contact): contact is EntryContactSource => contact !== null),
  };
}

// The one-person audience: only entries where `personId` is the owner, co-owner or handler,
// and on each only THAT person (the co-owner or handler on the same entry is not messaged).
// No armband is carried, so ringside favorite-matching can never widen it. Empty when the
// person is not on any of the rows, which the handler reports without naming anyone.
export function scopeEntriesToPerson(
  rows: EntryPeopleRow[],
  personId: string
): EntryRecipientSource[] {
  return rows.flatMap(row => {
    const person = entryPeople(row).find(candidate => candidate.id === personId);
    if (!person) return [];
    const contact = contactFromPerson(person);
    return [
      {
        armband: null,
        authUserIds: [person.auth_user_id],
        contacts: contact ? [contact] : [],
      },
    ];
  });
}

export function uniqueAccountRecipients(
  entries: EntryRecipientSource[],
  senderId: string
): string[] {
  const recipients = new Set<string>();
  for (const entry of entries) {
    for (const authUserId of entry.authUserIds) {
      if (authUserId && authUserId !== senderId) recipients.add(authUserId);
    }
  }
  return [...recipients];
}

// Resolve who an "also send by email" message goes to, from the SAME entries the
// inbox thread audience comes from. Dedupes by person (one person with three dogs
// gets one email) and by address (two people sharing an inbox get one email).
// Conservative shape check: one @, something before it, a dot inside the domain, no
// spaces. A malformed address would 422 a whole Resend batch, so it is named instead.
export function isUsableEmailAddress(email: string): boolean {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email);
}

export function resolveEmailAudience(
  entries: EntryRecipientSource[],
  senderId: string
): EmailAudience {
  const seenPeople = new Set<string>();
  const seenEmails = new Set<string>();
  const recipients: EmailRecipient[] = [];
  const missing: string[] = [];

  for (const entry of entries) {
    for (const contact of entry.contacts ?? []) {
      if (contact.authUserId && contact.authUserId === senderId) continue;
      const email = contact.email?.trim() ?? '';
      const personKey = contact.personId ?? (email ? email.toLowerCase() : contact.name);
      if (seenPeople.has(personKey)) continue;
      seenPeople.add(personKey);

      if (!email || !isUsableEmailAddress(email)) {
        missing.push(contact.name);
        continue;
      }
      const emailKey = email.toLowerCase();
      if (seenEmails.has(emailKey)) continue;
      seenEmails.add(emailKey);
      recipients.push({ email, name: contact.name });
    }
  }

  return { recipients, missing };
}

// People reached by ANY channel: inbox accounts plus emailed people, one count per person
// (a person with an account and an address is one). Unlinked exhibitors who only have an
// address are still reached, so an email-only audience is never reported as empty.
export function countPeopleReached(
  entries: EntryRecipientSource[],
  accountRecipientIds: string[],
  emailRecipients: EmailRecipient[]
): number {
  const reached = new Set<string>(accountRecipientIds.map(id => `auth:${id}`));
  const emailed = new Set(emailRecipients.map(recipient => recipient.email.toLowerCase()));
  for (const entry of entries) {
    for (const contact of entry.contacts ?? []) {
      const email = contact.email?.trim().toLowerCase() ?? '';
      if (!email || !emailed.has(email)) continue;
      reached.add(
        contact.authUserId ? `auth:${contact.authUserId}` : `person:${contact.personId ?? email}`
      );
    }
  }
  return reached.size;
}

export function callerRoleAuthorizesShow(
  role: CallerRoleSource,
  show: { id: string; club_id: string | null }
): boolean {
  const roleName = role.roles?.name;
  if (roleName === 'platform_admin' || roleName === 'site_admin') return true;
  if (roleName !== 'secretary' && roleName !== 'trial_secretary') return false;
  return role.club_id === show.club_id || role.show_id === show.id;
}

export function targetArmbands(entries: EntryRecipientSource[]): string[] {
  return [...new Set(entries.map(entry => entry.armband?.trim()).filter(Boolean) as string[])];
}

export function ringsideSessionMatchesTarget(
  session: RingsideSessionSource,
  targetType: TargetType,
  armbands: string[]
): boolean {
  // Targeted secretary messages are exhibitor-facing; judge/steward passcode
  // sessions are intentionally excluded until staff broadcasts are split out.
  if (session.role !== 'exhibitor') return false;
  if (targetType === 'all_show') return true;
  if (armbands.length === 0) return false;
  const targetSet = new Set(armbands.map(armband => armband.toLowerCase()));
  return session.favoritedArmbands.some(armband => targetSet.has(armband.toLowerCase()));
}

export function isPresenceSuppressed(
  session: Pick<RingsideSessionSource, 'lastSeenAt' | 'lastSeenRoute'>,
  nowMs = Date.now()
): boolean {
  if (!session.lastSeenAt || !session.lastSeenRoute?.startsWith('/at-show')) return false;
  const lastSeenMs = Date.parse(session.lastSeenAt);
  if (Number.isNaN(lastSeenMs)) return false;
  return nowMs - lastSeenMs <= 60_000;
}

export function buildGroupLabel(args: {
  targetType: TargetType;
  classNumber?: number | string | null;
  className?: string | null;
}): string {
  if (args.targetType === 'checked_in') return 'Sent to everyone checked in';
  if (args.targetType === 'all_show') return 'Sent to everyone in the show';
  if (args.targetType === 'person') return 'Sent to you by the show secretary';

  if (args.classNumber || args.className) {
    const classId = args.classNumber ? `Class ${args.classNumber}` : 'class';
    return `Sent to all ${classId}${args.className ? ` (${args.className})` : ''} exhibitors`;
  }

  return 'Sent to all class exhibitors';
}

export function buildRingsidePushActionUrl(
  showId: string,
  session: Pick<RingsideSessionSource, 'lastSeenRoute'>
): string {
  const fallback = `/at-show/${showId}`;
  const route = session.lastSeenRoute?.trim();
  if (!route) return fallback;
  return route === fallback || route.startsWith(`${fallback}/`) ? route : fallback;
}

// Decide where a tapped secretary-message push should land, per recipient identity.
// Account-keyed subscriptions (push_subscriptions.user_id set) belong to a signed-in
// exhibitor who has a real inbox thread page, so route them straight to that thread.
// Passcode (anonymous) ringside sessions have no inbox surface, so they stay in
// /at-show — falling back through buildRingsidePushActionUrl to their last ringside route.
export function buildTargetedMessageActionUrl(
  showId: string,
  subscription: { user_id?: string | null },
  session: Pick<RingsideSessionSource, 'lastSeenRoute'>
): string {
  if (subscription.user_id) return `/messages/${showId}`;
  return buildRingsidePushActionUrl(showId, session);
}

// Synthetic session for an entered account exhibitor's subscription that has no
// ringside presence. Account subscriptions route to /messages via user_id, so
// this only needs to be non-suppressing (null last-seen) — favorites/route are
// irrelevant. Lets account devices flow through the same fan-out as ringside.
export function accountPushSession(subscriptionId: string): RingsideSessionSource {
  return {
    subscriptionId,
    role: 'exhibitor',
    favoritedArmbands: [],
    lastSeenAt: null,
    lastSeenRoute: null,
  };
}

// Build push targets for entered account exhibitors' own devices. A device that
// also has a live ringside session (the exhibitor is actively at /at-show) inherits
// that real presence so presence-suppression still applies — even though the
// exhibitor was targeted by their entry, not by a favorited armband. Devices with
// no ringside session fall back to the non-suppressing synthetic session.
export function buildAccountPushTargets<S extends { id: string }>(
  subscriptions: S[],
  presenceBySubscriptionId: Map<string, Pick<RingsideSessionSource, 'lastSeenAt' | 'lastSeenRoute'>>
): Array<{ session: RingsideSessionSource; subscription: S }> {
  return subscriptions.map(subscription => {
    const base = accountPushSession(subscription.id);
    const presence = presenceBySubscriptionId.get(subscription.id);
    return {
      session: presence
        ? { ...base, lastSeenAt: presence.lastSeenAt, lastSeenRoute: presence.lastSeenRoute }
        : base,
      subscription,
    };
  });
}

// Merge ringside + account push targets, deduped by subscription id. Ringside
// entries win so an exhibitor who is actively at /at-show keeps their real
// presence (and thus suppression); account-only subscriptions fill in everyone
// else notified purely by their entry.
export function mergePushTargetsBySubscriptionId<T extends { subscription: { id: string } }>(
  ringside: T[],
  account: T[]
): T[] {
  const bySubscriptionId = new Map<string, T>();
  for (const target of ringside) bySubscriptionId.set(target.subscription.id, target);
  for (const target of account) {
    if (!bySubscriptionId.has(target.subscription.id)) {
      bySubscriptionId.set(target.subscription.id, target);
    }
  }
  return [...bySubscriptionId.values()];
}
