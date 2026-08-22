// supabase/functions/push-trigger-run-proximity/index.ts
//
// Database webhook fired when an entry's check_in_status flips to 'in-ring'.
// Pushes "you're N dogs away" to the watching exhibitors for the dogs coming
// up next in that class.
//
// WHY SERVER-SIDE: this used to be sent from the browser by
// useNotificationMonitor, which required the PWA process to be alive and merely
// backgrounded (`document.visibilityState !== 'visible'`). iOS Safari suspends
// backgrounded PWAs aggressively, so the exhibitor with the phone in their
// pocket at the crate — the whole point of the feature — got nothing. The
// client now delivers in-app only; push originates here.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { handle } from '../_shared/http/handler.ts';
import { HttpError } from '../_shared/http/responses.ts';
import { requirePushWebhookSecret } from '../_shared/pushWebhookAuth.ts';
import type { SmsProvider } from '../_shared/sms/smsProvider.ts';
import { createTwilioSmsProvider, readTwilioConfig } from '../_shared/sms/twilioSmsProvider.ts';
import {
  buildProximityPayload,
  pendingByRunOrder,
  resolveRecipients,
  shouldAlertOnTransition,
  type ProximityEntryRow,
  type WatcherRow,
} from './runProximity.ts';
import {
  decideChannels,
  dispatchProximityAlerts,
  DEFAULT_LEAD_DOGS,
  PROXIMITY_PREFERENCE_COLUMNS,
  type ChannelDecision,
  type ProximityPreferenceRow,
} from './proximitySms.ts';

interface WebhookPayload {
  type: 'UPDATE';
  table: string;
  record: {
    id: string;
    class_id: string;
    show_id: string;
    check_in_status: string | null;
  };
  old_record: {
    id: string;
    check_in_status: string | null;
  };
}

handle<WebhookPayload>(
  { auth: 'none', beforeBody: requirePushWebhookSecret },
  async ({ body, supabase }) => {
    // Only on the transition INTO the ring — a re-save of an already-in-ring
    // entry must not re-alert the same queue. With SMS attached this is a spend
    // guard, not just a noise guard.
    if (!shouldAlertOnTransition(body.record, body.old_record)) {
      return { status: 'no_action' };
    }

    const classId = body.record.class_id;
    const showId = body.record.show_id;

    // Whole class queue: the dogs-ahead index is only meaningful against every
    // entry, not just the watched ones.
    const { data: entryRows, error: entriesError } = await supabase
      .from('entries')
      .select(
        'id, dog_id, armband, run_order, is_scored, check_in_status, dog:dogs(call_name, owner:people!owner_id(auth_user_id), co_owner:people!co_owner_id(auth_user_id)), handler:people!handler_id(auth_user_id)'
      )
      .eq('class_id', classId)
      .is('deleted_at', null)
      .not('entry_status', 'in', '("withdrawn","scratched","absent")');

    if (entriesError) {
      console.error('push-trigger-run-proximity: class queue query failed', entriesError.message);
      throw new HttpError(500, 'Queue resolution failed');
    }
    if (!entryRows || entryRows.length === 0) {
      return { status: 'no_entries' };
    }

    const pending = pendingByRunOrder(entryRows as unknown as ProximityEntryRow[]);
    if (pending.length === 0) {
      return { status: 'queue_empty' };
    }

    // Accounts attached to each dog, and the dog's display name.
    const dogIdsByAuthUser = new Map<string, Set<string>>();
    const dogNameByDogId = new Map<string, string>();
    const entryById = new Map<string, { dogId: string; armband: number | null }>();

    for (const raw of entryRows) {
      const entry = raw as unknown as ProximityEntryRow & {
        dog?: {
          call_name?: string | null;
          owner?: { auth_user_id?: string | null } | null;
          co_owner?: { auth_user_id?: string | null } | null;
        } | null;
        handler?: { auth_user_id?: string | null } | null;
      };

      entryById.set(entry.id, { dogId: entry.dog_id, armband: entry.armband });
      if (entry.dog?.call_name) dogNameByDogId.set(entry.dog_id, entry.dog.call_name);

      for (const authUserId of [
        entry.dog?.owner?.auth_user_id,
        entry.dog?.co_owner?.auth_user_id,
        entry.handler?.auth_user_id,
      ]) {
        if (!authUserId) continue;
        const dogIds = dogIdsByAuthUser.get(authUserId) ?? new Set<string>();
        dogIds.add(entry.dog_id);
        dogIdsByAuthUser.set(authUserId, dogIds);
      }
    }

    // Favorites are keyed by (user, show, armband) — the at-show mirror that
    // lets a non-owner watch a dog. Only armbands still in this queue matter.
    const queueArmbands = pending
      .map(p => p.armband)
      .filter((armband): armband is number => armband !== null);
    const favoriteArmbandsByAuthUser = new Map<string, Set<number>>();

    if (queueArmbands.length > 0) {
      const { data: favorites, error: favoritesError } = await supabase
        .from('dog_favorites')
        .select('user_id, armband')
        .eq('show_id', showId)
        .in('armband', queueArmbands);

      if (favoritesError) {
        // Favorites are an enhancement; owners must still get their alert.
        console.error('push-trigger-run-proximity: favorites query failed', favoritesError.message);
      } else {
        for (const favorite of favorites ?? []) {
          const row = favorite as { user_id: string; armband: number };
          const armbands = favoriteArmbandsByAuthUser.get(row.user_id) ?? new Set<number>();
          armbands.add(row.armband);
          favoriteArmbandsByAuthUser.set(row.user_id, armbands);
        }
      }
    }

    const candidateUserIds = new Set<string>([
      ...dogIdsByAuthUser.keys(),
      ...favoriteArmbandsByAuthUser.keys(),
    ]);
    if (candidateUserIds.size === 0) {
      return { status: 'no_users_to_notify' };
    }

    // Per-user opt-in and threshold. A row is optional, and what its absence
    // MEANS differs per channel — see decideChannels.
    const { data: prefRows, error: prefsError } = await supabase
      .from('notification_preferences')
      .select(PROXIMITY_PREFERENCE_COLUMNS)
      .in('auth_user_id', [...candidateUserIds]);

    if (prefsError) {
      console.error('push-trigger-run-proximity: preferences query failed', prefsError.message);
      throw new HttpError(500, 'Preference resolution failed');
    }

    const prefsByAuthUser = new Map<string, ProximityPreferenceRow>();
    for (const raw of prefRows ?? []) {
      const pref = raw as unknown as ProximityPreferenceRow;
      prefsByAuthUser.set(pref.auth_user_id, pref);
    }

    // Channel selection is a PER-RECIPIENT decision made after resolution, not
    // a filter applied before it. An exhibitor with push off and SMS on — the
    // likeliest SMS user there is, since bad venue data is why they turned push
    // off — must still reach a send.
    const channelsByAuthUser = new Map<string, ChannelDecision>();
    const watchers: WatcherRow[] = [];
    for (const authUserId of candidateUserIds) {
      const channels = decideChannels(prefsByAuthUser.get(authUserId));
      if (!channels.push && !channels.sms) continue;

      channelsByAuthUser.set(authUserId, channels);
      watchers.push({
        authUserId,
        dogIds: dogIdsByAuthUser.get(authUserId) ?? new Set<string>(),
        favoriteArmbands: favoriteArmbandsByAuthUser.get(authUserId) ?? new Set<number>(),
        leadDogs: channels.leadDogs,
      });
    }

    const recipients = resolveRecipients(pending, watchers);
    if (recipients.length === 0) {
      return { status: 'no_users_to_notify' };
    }

    const { data: classRow } = await supabase
      .from('classes')
      .select('name')
      .eq('id', classId)
      .single();
    const className = (classRow as { name?: string } | null)?.name ?? 'your class';

    // The SMS provider is optional infrastructure. If it is unconfigured — or
    // A2P registration has not landed yet — push must still go out, so this
    // resolves to "SMS unavailable" rather than throwing.
    let smsProvider: SmsProvider | null = null;
    try {
      smsProvider = createTwilioSmsProvider(readTwilioConfig(name => Deno.env.get(name)));
    } catch {
      console.warn('push-trigger-run-proximity: SMS provider unconfigured; sending push only');
    }

    const dispatch = await dispatchProximityAlerts(recipients, {
      smsAvailable: smsProvider !== null,
      channelFor: authUserId =>
        channelsByAuthUser.get(authUserId) ?? {
          push: true,
          sms: false,
          smsPhone: null,
          leadDogs: DEFAULT_LEAD_DOGS,
        },
      contextFor: entryId => {
        const entry = entryById.get(entryId);
        return {
          dogName: (entry && dogNameByDogId.get(entry.dogId)) || 'Your dog',
          className,
          armband: entry?.armband ?? null,
        };
      },
      ports: {
        sendPush: async (recipient, context) => {
          const payload = buildProximityPayload({
            dogName: context.dogName,
            className: context.className,
            dogsAhead: recipient.dogsAhead,
            armband: context.armband,
          });
          // supabase-js RESOLVES with an `error` rather than rejecting, so
          // without this the push counter would report every failure as a send.
          const { error } = await supabase.functions.invoke('send-push-notification', {
            body: {
              user_id: recipient.authUserId,
              payload: { ...payload, actionUrl: `/classes/${classId}` },
            },
          });
          if (error) throw new Error(error.message);
        },
        claimSms: async (authUserId, entryId) => {
          const { data, error } = await supabase.rpc('claim_sms_proximity_send', {
            p_auth_user_id: authUserId,
            p_entry_id: entryId,
          });
          // A failed claim must not be read as "go ahead" — an unknown marker
          // state is treated as already-sent so a database blip cannot become a
          // duplicate-send storm against the campaign cap.
          if (error) throw new Error(error.message);
          return data === true;
        },
        sendSms: input => smsProvider!.send(input),
        releaseSms: async (authUserId, entryId) => {
          const { error } = await supabase.rpc('release_sms_proximity_send', {
            p_auth_user_id: authUserId,
            p_entry_id: entryId,
          });
          if (error) throw new Error(error.message);
        },
      },
    });

    return { status: 'push_sent', recipients: recipients.length, ...dispatch };
  }
);
