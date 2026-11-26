// The database side of the daily approval reminder (MYK9-2182): list the
// payouts due a reminder, claim one by stamping approval_reminded_at while it
// is still waiting and due, and put the stamp back when its reminder fails.
// The rules are in approvalReminders.ts.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';
import type { ReminderCursor, ReminderDeps, WaitingPayout } from './approvalReminders.ts';

/** Never reminded, or last reminded before the cutoff. */
function dueFilter(cutoffIso: string): string {
  return `approval_reminded_at.is.null,approval_reminded_at.lt."${cutoffIso}"`;
}

/**
 * Due and strictly after the cursor in (approval_reminded_at ASC NULLS FIRST, id).
 * After a never-reminded payout: the rest of those by id, then every reminded
 * one due. After a reminded one: a later stamp, or the same stamp and a later id.
 */
function afterCursor(cutoffIso: string, after: ReminderCursor): { lt: boolean; or: string } {
  if (after.remindedAt === null) {
    return {
      lt: false,
      or: `and(approval_reminded_at.is.null,id.gt.${after.id}),approval_reminded_at.lt."${cutoffIso}"`,
    };
  }
  const at = after.remindedAt;
  return {
    lt: true,
    or: `approval_reminded_at.gt."${at}",and(approval_reminded_at.eq."${at}",id.gt.${after.id})`,
  };
}

interface DueRow {
  id: string;
  show_id: string;
  amount_cents: number;
  approval_reminded_at: string | null;
  shows: { name: string | null } | Array<{ name: string | null }> | null;
}

function showName(shows: DueRow['shows']): string | null {
  const show = Array.isArray(shows) ? shows[0] : shows;
  return show?.name ?? null;
}

export function createReminderStore(
  supabase: SupabaseClient
): Pick<ReminderDeps, 'listDue' | 'claim' | 'release'> {
  return {
    async listDue({ cutoffIso, after, limit }) {
      let query = supabase
        .from('show_payouts')
        .select('id, show_id, amount_cents, approval_reminded_at, shows(name)')
        .eq('status', 'awaiting_approval');
      if (after) {
        const keyset = afterCursor(cutoffIso, after);
        if (keyset.lt) query = query.lt('approval_reminded_at', cutoffIso);
        query = query.or(keyset.or);
      } else {
        query = query.or(dueFilter(cutoffIso));
      }
      const { data, error } = await query
        .order('approval_reminded_at', { ascending: true, nullsFirst: true })
        .order('id', { ascending: true })
        .limit(limit);
      if (error) {
        console.error('Payout approval reminders: due payouts could not be read', error);
        return null;
      }
      return ((data ?? []) as unknown as DueRow[]).map((row): WaitingPayout => ({
        id: row.id,
        showId: row.show_id,
        showName: showName(row.shows),
        amountCents: row.amount_cents,
        remindedAt: row.approval_reminded_at,
      }));
    },

    async claim(payout, { cutoffIso, stampIso }) {
      const { data, error } = await supabase
        .from('show_payouts')
        .update({ approval_reminded_at: stampIso })
        .eq('id', payout.id)
        .eq('status', 'awaiting_approval')
        .or(dueFilter(cutoffIso))
        .select('id');
      if (error) {
        console.error(`Payout ${payout.id}: reminder could not be claimed`, error);
        return 'error';
      }
      return (data ?? []).length > 0 ? 'claimed' : 'gone';
    },

    async release(payout, stampIso) {
      const { error } = await supabase
        .from('show_payouts')
        .update({ approval_reminded_at: payout.remindedAt })
        .eq('id', payout.id)
        .eq('approval_reminded_at', stampIso);
      if (error) console.error(`Payout ${payout.id}: reminder stamp could not be put back`, error);
      return !error;
    },
  };
}
