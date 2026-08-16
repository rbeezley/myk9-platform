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
import {
  buildProximityPayload,
  pendingByRunOrder,
  resolveRecipients,
  type ProximityEntryRow,
  type WatcherRow,
} from './runProximity.ts';

const DEFAULT_LEAD_DOGS = 3;

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
    // entry must not re-alert the same queue.
    if (body.record.check_in_status !== 'in-ring' || body.old_record.check_in_status === 'in-ring') {
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

    // Per-user opt-in and threshold. A row is optional — the table's defaults
    // (push on, upcoming runs on) are the intent for accounts without one.
    const { data: prefRows, error: prefsError } = await supabase
      .from('notification_preferences')
      .select('auth_user_id, push_enabled, upcoming_runs, lead_dogs')
      .in('auth_user_id', [...candidateUserIds]);

    if (prefsError) {
      console.error('push-trigger-run-proximity: preferences query failed', prefsError.message);
      throw new HttpError(500, 'Preference resolution failed');
    }

    const prefsByAuthUser = new Map<
      string,
      { push_enabled: boolean | null; upcoming_runs: boolean | null; lead_dogs: number | null }
    >();
    for (const raw of prefRows ?? []) {
      const pref = raw as {
        auth_user_id: string;
        push_enabled: boolean | null;
        upcoming_runs: boolean | null;
        lead_dogs: number | null;
      };
      prefsByAuthUser.set(pref.auth_user_id, pref);
    }

    const watchers: WatcherRow[] = [];
    for (const authUserId of candidateUserIds) {
      const pref = prefsByAuthUser.get(authUserId);
      if (pref && (pref.push_enabled === false || pref.upcoming_runs === false)) continue;

      watchers.push({
        authUserId,
        dogIds: dogIdsByAuthUser.get(authUserId) ?? new Set<string>(),
        favoriteArmbands: favoriteArmbandsByAuthUser.get(authUserId) ?? new Set<number>(),
        leadDogs: pref?.lead_dogs ?? DEFAULT_LEAD_DOGS,
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

    await Promise.allSettled(
      recipients.map(recipient => {
        const entry = entryById.get(recipient.entryId);
        const payload = buildProximityPayload({
          dogName: (entry && dogNameByDogId.get(entry.dogId)) || 'Your dog',
          className,
          dogsAhead: recipient.dogsAhead,
          armband: entry?.armband ?? null,
        });
        return supabase.functions.invoke('send-push-notification', {
          body: {
            user_id: recipient.authUserId,
            payload: { ...payload, actionUrl: `/classes/${classId}` },
          },
        });
      })
    );

    return { status: 'push_sent', recipients: recipients.length };
  }
);
