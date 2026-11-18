import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';

import { HttpError } from '../_shared/http/responses.ts';
import type {
  ReminderSubmission,
  ReminderTrial,
} from '../_shared/showCloseout/registryDeadlineReminder.ts';

const TABLE = 'registry_deadline_reminders';
/** A claim with no `sent_at` older than this belongs to a run that died before it sent. */
const CLAIM_LEASE_MS = 15 * 60 * 1000;
/** A trial's last day sits at most this far behind today when a reminder can still be due (15 + margin). */
const LOOKBACK_DAYS = 21;

export interface ReminderCandidate {
  showId: string;
  showName: string;
  trials: ReminderTrial[];
  submissions: ReminderSubmission[];
}

export interface ClaimKey {
  showId: string;
  registryId: string;
  deadline: string;
}

/** Everything the run needs from the database, so the run itself is testable without one. */
export interface ReminderStore {
  loadCandidates(now: Date): Promise<ReminderCandidate[]>;
  /** The claim token (its `claimed_at`) when this run owns the reminder, `null` when it is taken. */
  claim(key: ClaimKey, now: Date): Promise<string | null>;
  release(key: ClaimKey, token: string): Promise<void>;
  /** Marks the reminder sent. Returns false when the stamp did not land. */
  stampSent(key: ClaimKey, token: string, now: Date, recipientCount: number): Promise<boolean>;
}

function keyColumns(key: ClaimKey) {
  return { show_id: key.showId, registry_id: key.registryId, deadline_date: key.deadline };
}

function dayOffset(now: Date, days: number): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

export function makeSupabaseStore(supabase: SupabaseClient): ReminderStore {
  return {
    async loadCandidates(now) {
      // Shows with a trial inside the window where any deadline could be near, then ALL of each
      // show's trials: the last trial day, not the first, sets the deadline.
      const { data: recent, error: recentError } = await supabase
        .from('trials')
        .select('show_id')
        .gte('date', dayOffset(now, -LOOKBACK_DAYS))
        .lte('date', dayOffset(now, 1))
        .is('deleted_at', null);
      if (recentError) throw new HttpError(500, 'Failed to look up recent trials.');
      const showIds = [...new Set((recent ?? []).map(row => row.show_id as string))];
      if (showIds.length === 0) return [];

      const { data: shows, error: showsError } = await supabase
        .from('shows')
        .select('id, name, status')
        .in('id', showIds)
        .is('deleted_at', null);
      if (showsError) throw new HttpError(500, 'Failed to load shows.');
      const live = (shows ?? []).filter(
        show => !['draft', 'cancelled'].includes(String(show.status ?? '').toLowerCase())
      );
      if (live.length === 0) return [];
      const liveIds = live.map(show => show.id as string);

      const { data: trials, error: trialsError } = await supabase
        .from('trials')
        .select('show_id, date, timezone, registry_id, trial_type, status')
        .in('show_id', liveIds)
        .is('deleted_at', null);
      if (trialsError) throw new HttpError(500, 'Failed to load trials.');

      const { data: submissions, error: submissionsError } = await supabase
        .from('result_submissions')
        .select('show_id, organization, status')
        .in('show_id', liveIds);
      if (submissionsError) throw new HttpError(500, 'Failed to load result submissions.');

      return live.map(show => ({
        showId: show.id as string,
        showName: String(show.name ?? 'Your show'),
        trials: (trials ?? [])
          .filter(row => row.show_id === show.id)
          .map(row => ({
            date: (row.date as string | null) ?? null,
            timeZone: (row.timezone as string | null) ?? null,
            registryId: (row.registry_id as string | null) ?? null,
            trialType: (row.trial_type as string | null) ?? null,
            status: (row.status as string | null) ?? null,
          })),
        submissions: (submissions ?? [])
          .filter(row => row.show_id === show.id)
          .map(row => ({
            organization: (row.organization as string | null) ?? null,
            status: (row.status as string | null) ?? null,
          })),
      }));
    },

    async claim(key, now) {
      const token = now.toISOString();
      // INSERT ... ON CONFLICT DO NOTHING: only the run that inserts the row gets it back.
      const { data: inserted, error } = await supabase
        .from(TABLE)
        .upsert(
          { ...keyColumns(key), claimed_at: token },
          { onConflict: 'show_id,registry_id,deadline_date', ignoreDuplicates: true }
        )
        .select('id');
      if (error) throw new HttpError(500, 'Failed to claim the reminder.');
      if (inserted?.length) return token;

      // The row exists. It proves a send only when `sent_at` is set; an old unsent claim belongs
      // to a run that died, and exactly one run may take it over (compare-and-swap on claimed_at).
      const { data: existing, error: existingError } = await supabase
        .from(TABLE)
        .select('claimed_at, sent_at')
        .match(keyColumns(key))
        .maybeSingle();
      if (existingError) throw new HttpError(500, 'Failed to read the existing reminder claim.');
      if (!existing || existing.sent_at) return null;
      const claimedAt = Date.parse(existing.claimed_at as string);
      if (Number.isNaN(claimedAt) || now.getTime() - claimedAt < CLAIM_LEASE_MS) return null;

      const takeover = new Date(now.getTime() + 1).toISOString();
      const { data: reclaimed, error: reclaimError } = await supabase
        .from(TABLE)
        .update({ claimed_at: takeover })
        .match(keyColumns(key))
        .eq('claimed_at', existing.claimed_at)
        .is('sent_at', null)
        .select('id');
      if (reclaimError) throw new HttpError(500, 'Failed to reclaim the stale reminder.');
      return reclaimed?.length ? takeover : null;
    },

    async release(key, token) {
      await supabase
        .from(TABLE)
        .delete()
        .match(keyColumns(key))
        .eq('claimed_at', token)
        .is('sent_at', null);
    },

    async stampSent(key, token, now, recipientCount) {
      const { error } = await supabase
        .from(TABLE)
        .update({ sent_at: now.toISOString(), recipient_count: recipientCount })
        .match(keyColumns(key))
        .eq('claimed_at', token);
      return !error;
    },
  };
}
