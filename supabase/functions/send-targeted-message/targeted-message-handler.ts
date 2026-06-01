import { HttpError } from '../_shared/http/responses.ts';
import {
  buildGroupLabel,
  CALLER_ROLE_SELECT,
  callerRoleAuthorizesShow,
  normalizeTargetType,
  RINGSIDE_SESSION_PUSH_TARGET_SELECT,
  ringsideSessionMatchesTarget,
  targetArmbands,
  uniqueAccountRecipients,
  type CallerRoleSource,
  type EntryRecipientSource,
  type RingsideSessionSource,
  type TargetType,
} from './targeting.ts';

export interface SendTargetedMessagePayload {
  show_id?: string;
  class_id?: string;
  target_type?: TargetType;
  body?: string;
  send_push?: boolean;
}

export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh?: string | null;
  auth?: string | null;
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
  supabase: any;
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
  supabase: any;
}

function subscriptionFromSession(row: RingsideSessionRow): PushSubscriptionRow | null {
  const joined = Array.isArray(row.push_subscriptions)
    ? row.push_subscriptions[0]
    : row.push_subscriptions;
  return joined ?? null;
}

async function fetchEntriesForTarget(
  supabase: any,
  showId: string,
  targetType: TargetType,
  classId: string | undefined
): Promise<EntryRecipientSource[]> {
  let query = supabase
    .from('entries')
    .select(
      'armband, dog:dogs(owner:people!owner_id(auth_user_id), co_owner:people!co_owner_id(auth_user_id)), handler:people!handler_id(auth_user_id)'
    )
    .eq('show_id', showId)
    .is('deleted_at', null);

  if (targetType === 'class') {
    if (!classId) throw new HttpError(400, 'Missing required field: class_id');
    query = query.eq('class_id', classId);
  } else if (targetType === 'checked_in') {
    query = query.in('check_in_status', ['checked-in', 'at-gate', 'come-to-gate', 'in-ring']);
  }

  const { data, error } = await query;
  if (error) throw new HttpError(500, 'Failed to resolve message recipients');

  return (data ?? []).map((entry: any) => ({
    armband: entry.armband ? String(entry.armband) : null,
    authUserIds: [
      entry.dog?.owner?.auth_user_id,
      entry.dog?.co_owner?.auth_user_id,
      entry.handler?.auth_user_id,
    ],
  }));
}

async function fetchClassInfo(supabase: any, classId: string | undefined) {
  if (!classId) return null;
  const { data } = await supabase
    .from('classes')
    .select('id, class_number, name')
    .eq('id', classId)
    .single();
  return data;
}

async function assertClassBelongsToShow(
  supabase: any,
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
  supabase: any,
  showId: string,
  targetType: TargetType,
  armbands: string[]
): Promise<Array<{ session: RingsideSessionSource; subscription: PushSubscriptionRow }>> {
  // The secretary targeted-message surface is currently exhibitor messaging.
  // Staff passcode roles need a separate operational broadcast lane before they
  // are included in "all show" notifications.
  const { data, error } = await supabase
    .from('ringside_sessions')
    .select(RINGSIDE_SESSION_PUSH_TARGET_SELECT)
    .eq('show_id', showId)
    .eq('role', 'exhibitor');

  if (error) throw new HttpError(500, 'Failed to resolve ringside recipients');

  const bySubscriptionId = new Map<
    string,
    { session: RingsideSessionSource; subscription: PushSubscriptionRow }
  >();

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
    if (!ringsideSessionMatchesTarget(session, targetType, armbands)) continue;
    bySubscriptionId.set(subscription.id, { session, subscription });
  }

  return [...bySubscriptionId.values()];
}

export function createSendTargetedMessageHandler(deps: {
  sendPasscodePushes: SendPasscodePushes;
}) {
  return async ({ body: payload, user, supabase }: TargetedMessageHandlerContext) => {
    if (!user) throw new HttpError(401, 'Unauthorized');

    const showId = payload.show_id;
    const targetType = normalizeTargetType(payload.target_type);
    const body = payload.body?.trim();
    const sendPush = payload.send_push === true;

    if (!showId || !body) {
      throw new HttpError(400, 'Missing required fields: show_id, body');
    }

    const { data: show } = await supabase
      .from('shows')
      .select('id, club_id')
      .eq('id', showId)
      .single();

    if (!show) throw new HttpError(404, 'Show not found');

    const { data: callerRoles, error: callerRolesError } = await supabase
      .from('user_roles')
      .select(CALLER_ROLE_SELECT)
      .eq('auth_user_id', user.id)
      .eq('is_active', true);

    if (callerRolesError) throw new HttpError(500, 'Failed to verify sender role');

    const canSendForShow = ((callerRoles ?? []) as CallerRoleSource[]).some(role =>
      callerRoleAuthorizesShow(role, show)
    );

    if (!canSendForShow) {
      throw new HttpError(403, 'Forbidden: secretary or admin role required');
    }

    await assertClassBelongsToShow(supabase, payload.class_id, showId);
    const [entries, classInfo] = await Promise.all([
      fetchEntriesForTarget(supabase, showId, targetType, payload.class_id),
      fetchClassInfo(supabase, payload.class_id),
    ]);

    if (entries.length === 0) {
      return { sent_to: 0, total_recipients: 0, push_sent: 0 };
    }

    const accountRecipientIds = uniqueAccountRecipients(entries, user.id);
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

      const { data: upsertedThreads, error: upsertError } = await supabase
        .from('show_message_threads')
        .upsert(threadUpserts, { onConflict: 'show_id,participant_id' })
        .select('id, participant_id');

      if (upsertError || !upsertedThreads) {
        throw new HttpError(500, 'Failed to create threads');
      }

      const messageInserts = upsertedThreads.map((thread: any) => ({
        show_id: showId,
        thread_id: thread.id,
        sender_id: user.id,
        body,
        group_label: groupLabel,
        push_alert: sendPush,
      }));

      const { data: insertedMessages, error: insertError } = await supabase
        .from('show_messages')
        .insert(messageInserts)
        .select('id');

      if (insertError) throw new HttpError(500, 'Failed to send messages');
      insertedMessageIds = (insertedMessages ?? []).map((message: { id: string }) => message.id);
    }

    const ringsideTargets = sendPush
      ? await fetchRingsidePushTargets(supabase, showId, targetType, armbands)
      : [];
    const pushResult = await deps.sendPasscodePushes({
      supabase,
      body,
      messageId: insertedMessageIds[0] ?? null,
      showId,
      targets: ringsideTargets,
    });

    return {
      sent_to: insertedMessageIds.length,
      total_recipients: accountRecipientIds.length + ringsideTargets.length,
      group_label: groupLabel,
      push_sent: pushResult.sent,
      push_suppressed: pushResult.suppressed,
      push_failed: pushResult.failed,
      dead_subs_cleaned: pushResult.dead,
    };
  };
}
