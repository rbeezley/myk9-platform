import { HttpError } from '../_shared/http/responses.ts';
import { applyActiveRoleValidity } from '../_shared/roleValidity.ts';
import { emailFields, writeEmailLog, type SendShowMessageEmails } from './emailDelivery.ts';
import {
  ACCOUNT_PUSH_SUBSCRIPTION_SELECT,
  buildAccountPushTargets,
  buildGroupLabel,
  ENTRY_PERSON_FIELDS,
  CALLER_ROLE_SELECT,
  callerRoleAuthorizesShow,
  entrySource,
  mergePushTargetsBySubscriptionId,
  normalizeTargetType,
  resolveEmailAudience,
  scopeEntriesToPerson,
  RINGSIDE_SESSION_PUSH_TARGET_SELECT,
  ringsideSessionMatchesTarget,
  countPeopleReached,
  targetArmbands,
  uniqueAccountRecipients,
  type CallerRoleSource,
  type EntryPeopleRow,
  type EmailRecipient,
  type EntryRecipientSource,
  type RingsideSessionSource,
  type TargetType,
} from './targeting.ts';

// Chunk size for the account push-subscription user_id IN(...) filter, matching
// push-trigger-announcement. Keeps large checked_in / all_show sends under
// PostgREST URL length limits.
const ACCOUNT_PUSH_FETCH_CHUNK_SIZE = 100;

// Ids interpolated into a PostgREST filter string must be plain id characters.
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

type RingsidePresence = Pick<RingsideSessionSource, 'lastSeenAt' | 'lastSeenRoute'>;

type PushTarget = { session: RingsideSessionSource; subscription: PushSubscriptionRow };

export interface SendTargetedMessagePayload {
  show_id?: string;
  class_id?: string;
  // With target_type 'person': the one exhibitor (people.id) to message. They must be the
  // owner, co-owner or handler on a live entry in this show.
  person_id?: string;
  target_type?: TargetType;
  body?: string;
  send_push?: boolean;
  // Also email every recipient in the audience who has an address on file. The
  // address list is resolved here from the audience; the client never sends one.
  send_email?: boolean;
  // Skip the inbox thread + push and only email (the show-wide lane posts its
  // in-app copy as an announcement, so it must not be duplicated into threads).
  email_only?: boolean;
  // Resolve and count the audience without writing or sending anything.
  dry_run?: boolean;
}

export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh?: string | null;
  auth?: string | null;
  // Null for passcode (anonymous) subscriptions; set for signed-in accounts.
  // Drives push-tap routing — see buildTargetedMessageActionUrl.
  user_id?: string | null;
}

interface SupabaseQueryResult<T = unknown> {
  data: T | null;
  error: unknown;
}

interface SupabaseQuery<T = unknown> extends PromiseLike<SupabaseQueryResult<T>> {
  select(columns: string): SupabaseQuery<T>;
  eq(column: string, value: unknown): SupabaseQuery<T>;
  is(column: string, value: unknown): SupabaseQuery<T>;
  or(filter: string): SupabaseQuery<T>;
  in(column: string, values: readonly unknown[]): SupabaseQuery<T>;
  upsert(rows: unknown, options?: unknown): SupabaseQuery<T>;
  insert(rows: unknown): SupabaseQuery<T>;
  single(): Promise<SupabaseQueryResult<T>>;
}

export interface TargetedMessageSupabaseClient {
  from(table: string): SupabaseQuery;
}

interface ShowRow {
  id: string;
  club_id: string | null;
  name?: string | null;
}

interface ClassInfoRow {
  id: string;
  class_number: number | string | null;
  name: string | null;
}

interface MessageThreadRow {
  id: string;
  participant_id: string;
}

interface InsertedMessageRow {
  id: string;
}

interface RingsideSessionRow {
  subscription_id: string;
  role: RingsideSessionSource['role'];
  favorited_armbands: string[] | null;
  last_seen_at: string | null;
  last_seen_route: string | null;
  push_subscriptions?: PushSubscriptionRow | PushSubscriptionRow[] | null;
}

export interface SendPasscodePushesArgs {
  supabase: TargetedMessageSupabaseClient;
  body: string;
  messageId: string | null;
  showId: string;
  targets: Array<{ session: RingsideSessionSource; subscription: PushSubscriptionRow }>;
}

export interface SendPasscodePushesResult {
  attempted: number;
  sent: number;
  suppressed: number;
  failed: number;
  dead: number;
}

export type SendPasscodePushes = (
  args: SendPasscodePushesArgs
) => Promise<SendPasscodePushesResult>;

export interface TargetedMessageHandlerContext {
  body: SendTargetedMessagePayload;
  user?: { id: string };
  supabase: TargetedMessageSupabaseClient;
}

function subscriptionFromSession(row: RingsideSessionRow): PushSubscriptionRow | null {
  const joined = Array.isArray(row.push_subscriptions)
    ? row.push_subscriptions[0]
    : row.push_subscriptions;
  return joined ?? null;
}

// A person is on an entry as the handler or as their dog's owner or co-owner.
async function personEntryFilter(
  supabase: TargetedMessageSupabaseClient,
  personId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('dogs')
    .select('id')
    .or(`owner_id.eq.${personId},co_owner_id.eq.${personId}`);
  if (error) throw new HttpError(500, 'Failed to resolve message recipients');
  const dogIds = ((data ?? []) as Array<{ id: string }>)
    .map(dog => dog.id)
    .filter(id => SAFE_ID.test(id));
  return [
    `handler_id.eq.${personId}`,
    ...(dogIds.length ? [`dog_id.in.(${dogIds.join(',')})`] : []),
  ].join(',');
}

async function fetchEntriesForTarget(
  supabase: TargetedMessageSupabaseClient,
  showId: string,
  targetType: TargetType,
  classId: string | undefined,
  personId: string | undefined
): Promise<EntryRecipientSource[]> {
  let query = supabase
    .from('entries')
    .select(
      `armband, dog:dogs(owner:people!owner_id(${ENTRY_PERSON_FIELDS}), co_owner:people!co_owner_id(${ENTRY_PERSON_FIELDS})), handler:people!handler_id(${ENTRY_PERSON_FIELDS})`
    )
    .eq('show_id', showId)
    .is('deleted_at', null);

  if (targetType === 'class') {
    if (!classId) throw new HttpError(400, 'Missing required field: class_id');
    query = query.eq('class_id', classId);
  } else if (targetType === 'person') {
    if (!personId || !SAFE_ID.test(personId)) {
      throw new HttpError(400, 'Missing or invalid field: person_id');
    }
    // Filtered in the database, not after the fetch: a show past PostgREST's row cap would
    // otherwise hide this person's entries and report a false "not found".
    query = query.or(await personEntryFilter(supabase, personId));
  } else if (targetType === 'checked_in') {
    query = query.in('check_in_status', ['checked-in', 'at-gate', 'come-to-gate', 'in-ring']);
  }

  const { data, error } = await query;
  if (error) throw new HttpError(500, 'Failed to resolve message recipients');

  const rows = Array.isArray(data) ? (data as EntryPeopleRow[]) : [];
  return targetType === 'person' && personId
    ? scopeEntriesToPerson(rows, personId)
    : rows.map(entrySource);
}

async function fetchClassInfo(
  supabase: TargetedMessageSupabaseClient,
  classId: string | undefined
): Promise<ClassInfoRow | null> {
  if (!classId) return null;
  const { data } = await supabase
    .from('classes')
    .select('id, class_number, name')
    .eq('id', classId)
    .single();
  return data as ClassInfoRow | null;
}

async function assertClassBelongsToShow(
  supabase: TargetedMessageSupabaseClient,
  classId: string | undefined,
  showId: string
) {
  if (!classId) return;
  const { data: classCheck } = await supabase
    .from('classes')
    .select('id, trials!inner(show_id)')
    .eq('id', classId)
    .eq('trials.show_id', showId)
    .single();

  if (!classCheck) throw new HttpError(400, 'Class does not belong to this show');
}

async function fetchRingsidePushTargets(
  supabase: TargetedMessageSupabaseClient,
  showId: string,
  targetType: TargetType,
  armbands: string[]
): Promise<{ targets: PushTarget[]; presenceBySubscriptionId: Map<string, RingsidePresence> }> {
  // The secretary targeted-message surface is currently exhibitor messaging.
  // Staff passcode roles need a separate operational broadcast lane before they
  // are included in "all show" notifications.
  const { data, error } = await supabase
    .from('ringside_sessions')
    .select(RINGSIDE_SESSION_PUSH_TARGET_SELECT)
    .eq('show_id', showId)
    .eq('role', 'exhibitor');

  if (error) throw new HttpError(500, 'Failed to resolve ringside recipients');

  const bySubscriptionId = new Map<string, PushTarget>();
  // Presence for EVERY exhibitor session, keyed by its real subscription id —
  // including sessions that don't match the target's armbands. An account
  // exhibitor targeted by entry (not favorite) reuses this so their live
  // /at-show presence still suppresses a redundant push.
  const presenceBySubscriptionId = new Map<string, RingsidePresence>();

  for (const row of (data ?? []) as RingsideSessionRow[]) {
    const subscription = subscriptionFromSession(row);
    if (!subscription) continue;
    const session: RingsideSessionSource = {
      subscriptionId: row.subscription_id,
      role: row.role,
      favoritedArmbands: row.favorited_armbands ?? [],
      lastSeenAt: row.last_seen_at,
      lastSeenRoute: row.last_seen_route,
    };
    presenceBySubscriptionId.set(subscription.id, {
      lastSeenAt: session.lastSeenAt,
      lastSeenRoute: session.lastSeenRoute,
    });
    if (!ringsideSessionMatchesTarget(session, targetType, armbands)) continue;
    bySubscriptionId.set(subscription.id, { session, subscription });
  }

  return { targets: [...bySubscriptionId.values()], presenceBySubscriptionId };
}

// Push targets for entered account exhibitors, resolved by their entry's
// auth_user_id — not by a favorited armband or ringside session. This is how a
// signed-in exhibitor gets notified without the passcode-era favoriting step:
// they already receive the inbox thread, and now their devices receive the push
// too. buildTargetedMessageActionUrl routes these to /messages via user_id.
async function fetchAccountRecipientPushTargets(
  supabase: TargetedMessageSupabaseClient,
  accountRecipientIds: string[],
  presenceBySubscriptionId: Map<string, RingsidePresence>
): Promise<PushTarget[]> {
  if (accountRecipientIds.length === 0) return [];

  // Chunk the user_id IN(...) filter so large checked_in / all_show sends stay
  // under PostgREST URL length limits (mirrors push-trigger-announcement). The
  // inbox threads + messages are already written by this point, so an unchunked
  // overflow here would 500 after a successful write — a partial failure the
  // secretary would read as a total one.
  const chunkQueries: SupabaseQuery[] = [];
  for (let i = 0; i < accountRecipientIds.length; i += ACCOUNT_PUSH_FETCH_CHUNK_SIZE) {
    chunkQueries.push(
      supabase
        .from('push_subscriptions')
        .select(ACCOUNT_PUSH_SUBSCRIPTION_SELECT)
        .in('user_id', accountRecipientIds.slice(i, i + ACCOUNT_PUSH_FETCH_CHUNK_SIZE))
    );
  }

  const chunkResults = await Promise.all(chunkQueries);
  const subscriptions: PushSubscriptionRow[] = [];
  for (const { data, error } of chunkResults) {
    if (error) throw new HttpError(500, 'Failed to resolve account push recipients');
    subscriptions.push(...((data ?? []) as PushSubscriptionRow[]));
  }

  return buildAccountPushTargets(subscriptions, presenceBySubscriptionId);
}

// Deploy order: deploy this function before the frontend (MYK9-1692).
export function createSendTargetedMessageHandler(deps: {
  sendPasscodePushes: SendPasscodePushes;
  sendShowMessageEmails?: SendShowMessageEmails;
}) {
  return async ({ body: payload, user, supabase }: TargetedMessageHandlerContext) => {
    if (!user) throw new HttpError(401, 'Unauthorized');

    const showId = payload.show_id;
    const targetType = normalizeTargetType(payload.target_type);
    const body = payload.body?.trim() ?? '';
    const emailOnly = payload.email_only === true;
    const sendEmail = payload.send_email === true || emailOnly;
    const sendPush = payload.send_push === true;
    const dryRun = payload.dry_run === true;

    // A dry run sends nothing, so it needs no body (the audience preview omits it on
    // purpose: a handler without dry_run support 400s here instead of broadcasting).
    if (!showId || (!body && !dryRun)) {
      throw new HttpError(400, 'Missing required fields: show_id, body');
    }

    const { data: show } = (await supabase
      .from('shows')
      .select('id, club_id, name')
      .eq('id', showId)
      .single()) as SupabaseQueryResult<ShowRow>;

    if (!show) throw new HttpError(404, 'Show not found');

    const { data: callerRoles, error: callerRolesError } = await applyActiveRoleValidity(
      supabase.from('user_roles').select(CALLER_ROLE_SELECT).eq('auth_user_id', user.id)
    );

    if (callerRolesError) throw new HttpError(500, 'Failed to verify sender role');

    const canSendForShow = ((callerRoles ?? []) as CallerRoleSource[]).some(role =>
      callerRoleAuthorizesShow(role, show)
    );

    if (!canSendForShow) {
      throw new HttpError(403, 'Forbidden: secretary or admin role required');
    }

    await assertClassBelongsToShow(supabase, payload.class_id, showId);
    const [entries, classInfo] = await Promise.all([
      fetchEntriesForTarget(supabase, showId, targetType, payload.class_id, payload.person_id),
      fetchClassInfo(supabase, payload.class_id),
    ]);

    if (targetType === 'person' && entries.length === 0) {
      // Not on any live entry in THIS show: say so without confirming who they are.
      throw new HttpError(404, 'Exhibitor not found in this show');
    }

    const emailAudience = sendEmail ? resolveEmailAudience(entries, user.id) : null;

    if (dryRun) {
      return { dry_run: true, total_recipients: entries.length, ...emailFields(emailAudience) };
    }

    if (entries.length === 0) {
      return {
        inbox_sent: 0,
        push_sent: 0,
        people_reached: 0,
        ...emailFields(emailAudience),
      };
    }

    const accountRecipientIds = emailOnly ? [] : uniqueAccountRecipients(entries, user.id);
    const armbands = targetArmbands(entries);
    const groupLabel = buildGroupLabel({
      targetType,
      classNumber: classInfo?.class_number,
      className: classInfo?.name,
    });

    let insertedMessageIds: string[] = [];
    if (accountRecipientIds.length > 0) {
      const now = new Date().toISOString();
      const threadUpserts = accountRecipientIds.map(recipientId => ({
        show_id: showId,
        participant_id: recipientId,
        last_message_at: now,
      }));

      const { data: upsertedThreads, error: upsertError } = (await supabase
        .from('show_message_threads')
        .upsert(threadUpserts, { onConflict: 'show_id,participant_id' })
        .select('id, participant_id')) as SupabaseQueryResult<MessageThreadRow[]>;

      if (upsertError || !upsertedThreads) {
        throw new HttpError(500, 'Failed to create threads');
      }

      const messageInserts = upsertedThreads.map(thread => ({
        show_id: showId,
        thread_id: thread.id,
        sender_id: user.id,
        body,
        group_label: groupLabel,
        push_alert: sendPush,
      }));

      const { data: insertedMessages, error: insertError } = (await supabase
        .from('show_messages')
        .insert(messageInserts)
        .select('id')) as SupabaseQueryResult<InsertedMessageRow[]>;

      if (insertError) throw new HttpError(500, 'Failed to send messages');
      insertedMessageIds = (insertedMessages ?? []).map((message: { id: string }) => message.id);
    }

    // Account exhibitors are notified by their entry, not by a favorited armband.
    // Resolve ringside presence first so their own devices inherit any live
    // /at-show presence (suppression), then merge — ringside wins on dedupe.
    let ringsideTargets: PushTarget[] = [];
    let accountPushTargets: PushTarget[] = [];
    if (sendPush) {
      const ringside = await fetchRingsidePushTargets(supabase, showId, targetType, armbands);
      ringsideTargets = ringside.targets;
      accountPushTargets = await fetchAccountRecipientPushTargets(
        supabase,
        accountRecipientIds,
        ringside.presenceBySubscriptionId
      );
    }
    const pushTargets = mergePushTargetsBySubscriptionId(ringsideTargets, accountPushTargets);
    const pushResult = emailOnly
      ? { attempted: 0, sent: 0, suppressed: 0, failed: 0, dead: 0 }
      : await deps.sendPasscodePushes({
          supabase,
          body,
          messageId: insertedMessageIds[0] ?? null,
          showId,
          targets: pushTargets,
        });

    // Email last: the inbox copy is already durable, so a mail failure is a counted
    // result the secretary sees, never a reason to lose or repeat the in-app send.
    let emailSent = 0;
    let emailFailed = 0;
    let emailLogFailed = false;
    let emailSucceededTo: EmailRecipient[] = [];
    if (emailAudience && emailAudience.recipients.length > 0) {
      if (!deps.sendShowMessageEmails) throw new HttpError(500, 'Email delivery is unavailable');
      const emailResult = await deps.sendShowMessageEmails({
        showId,
        showName: show.name?.trim() || 'your show',
        body,
        messageId: insertedMessageIds[0] ?? null,
        recipients: emailAudience.recipients,
      });
      emailSent = emailResult.sent;
      emailFailed = emailResult.failed;
      const sentTo = new Set(
        emailResult.logRows.filter(row => row.status === 'sent').map(row => row.recipient_email)
      );
      emailSucceededTo = emailAudience.recipients.filter(recipient => sentTo.has(recipient.email));
      emailLogFailed = !(await writeEmailLog(supabase, emailResult.logRows));
    }

    return {
      // Per-channel outcomes. people_reached counts a person once, by inbox or by an email
      // that actually went out (a failed attempt is not "reached").
      inbox_sent: insertedMessageIds.length,
      people_reached: countPeopleReached(entries, accountRecipientIds, emailSucceededTo),
      group_label: groupLabel,
      push_sent: pushResult.sent,
      push_suppressed: pushResult.suppressed,
      push_failed: pushResult.failed,
      dead_subs_cleaned: pushResult.dead,
      ...emailFields(emailAudience, emailSent, emailFailed, emailLogFailed),
    };
  };
}
