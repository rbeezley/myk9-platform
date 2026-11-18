import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';

import { HttpError } from '../_shared/http/responses.ts';
import { loadReminderCandidates, type ReminderCandidate } from './candidates.ts';

export type { ReminderCandidate };

const TABLE = 'registry_deadline_reminders';
/** A claim with no `sent_at` older than this belongs to a run that died before it finished. */
const CLAIM_LEASE_MS = 15 * 60 * 1000;

export interface ClaimKey {
  showId: string;
  registryId: string;
  deadline: string;
}

/** Everything the run needs from the database, so the run itself is testable without one. */
export interface ReminderStore {
  loadCandidates(now: Date): Promise<ReminderCandidate[]>;
  /**
   * The claim when this run owns the reminder, `null` when it is taken or finished. `accepted`
   * holds the lower-cased addresses an earlier run already got the provider to accept.
   */
  claim(key: ClaimKey, now: Date): Promise<Claim | null>;
  release(key: ClaimKey, token: string): Promise<void>;
  /** Saves every address accepted so far (the full list), so a retry skips them. False = not saved. */
  recordAccepted(key: ClaimKey, token: string, accepted: readonly string[]): Promise<boolean>;
  /** Marks the reminder sent to everyone. Returns false when the stamp did not land. */
  stampSent(key: ClaimKey, token: string, now: Date, recipientCount: number): Promise<boolean>;
}

export interface Claim {
  /** The compare-and-swap token (its `claimed_at`). */
  token: string;
  accepted: string[];
}

function keyColumns(key: ClaimKey) {
  return { show_id: key.showId, registry_id: key.registryId, deadline_date: key.deadline };
}

export function makeSupabaseStore(supabase: SupabaseClient): ReminderStore {
  return {
    loadCandidates: now => loadReminderCandidates(supabase, now),

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
      if (inserted?.length) return { token, accepted: [] };

      // The row exists. It proves a send only when `sent_at` is set; an old unsent claim belongs
      // to a run that died, and exactly one run may take it over (compare-and-swap on claimed_at).
      const { data: existing, error: existingError } = await supabase
        .from(TABLE)
        .select('claimed_at, sent_at, accepted_recipients')
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
      return reclaimed?.length
        ? { token: takeover, accepted: (existing.accepted_recipients as string[] | null) ?? [] }
        : null;
    },

    async release(key, token) {
      await supabase
        .from(TABLE)
        .delete()
        .match(keyColumns(key))
        .eq('claimed_at', token)
        .is('sent_at', null);
    },

    async recordAccepted(key, token, accepted) {
      const { error } = await supabase
        .from(TABLE)
        .update({ accepted_recipients: [...accepted] })
        .match(keyColumns(key))
        .eq('claimed_at', token);
      return !error;
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
