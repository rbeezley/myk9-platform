import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';

import type { EmergencyPacketInput } from '../_shared/trialPacket/renderer/types.ts';

/**
 * What `emergency_packet_input` does not return but the judge packet prints (MYK9-2079): each
 * trial's time zone, for the footer, and the judge the show roster names for a class the RPC
 * found no judge for. Read with the service-role client, so no RLS gets in the way, and merged
 * into the RPC input before it is split into trial days.
 */

interface JudgeAssignmentRow {
  class_id: string | null;
  person: { first_name: string | null; last_name: string | null } | null;
}

/**
 * A failed lookup costs the packet a footer clock or a judge name, not the packet: the paper is
 * still worth more on the night than no paper. Logged so the gap is visible in the function logs.
 */
function lookupFailed(what: string, error: { message?: string }): Map<string, string> {
  console.error(
    `generate-trial-packet: could not read ${what}; printing without them.`,
    error.message
  );
  return new Map();
}

function cleaned(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The judge each class has on the show's roster, as `show.assignedJudges` gives the browser, less
 * declined and cancelled rows. The first row with a name wins.
 */
async function loadRosterJudgesByClass(
  supabase: SupabaseClient,
  showId: string
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('judge_assignments')
    .select('class_id, person:people!judge_assignments_person_id_fkey(first_name, last_name)')
    .eq('show_id', showId)
    // A judge who declined or was cancelled is not this class's judge, whatever the roster
    // still lists; the oldest remaining row wins, so the choice is stable from run to run.
    .not('status', 'in', '(declined,cancelled)')
    .order('created_at', { ascending: true });
  if (error) return lookupFailed('the show judges', error);
  const byClass = new Map<string, string>();
  for (const row of (data ?? []) as unknown as JudgeAssignmentRow[]) {
    if (!row.class_id || byClass.has(row.class_id)) continue;
    const name = `${cleaned(row.person?.first_name)} ${cleaned(row.person?.last_name)}`.trim();
    if (name) byClass.set(row.class_id, name);
  }
  return byClass;
}

async function loadTrialTimezones(
  supabase: SupabaseClient,
  trialIds: string[]
): Promise<Map<string, string>> {
  if (trialIds.length === 0) return new Map();
  const { data, error } = await supabase.from('trials').select('id, timezone').in('id', trialIds);
  if (error) return lookupFailed('the trial time zones', error);
  const byTrial = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ id: string; timezone: string | null }>) {
    if (row.timezone) byTrial.set(row.id, row.timezone);
  }
  return byTrial;
}

/** The packet input with each trial's time zone set and empty class judge names filled in. */
export async function withPacketLookups(
  supabase: SupabaseClient,
  showId: string,
  input: EmergencyPacketInput
): Promise<EmergencyPacketInput> {
  const [timezones, rosterJudges] = await Promise.all([
    loadTrialTimezones(
      supabase,
      input.trials.map(trial => trial.id)
    ),
    loadRosterJudgesByClass(supabase, showId),
  ]);
  return {
    ...input,
    trials: input.trials.map(trial => {
      const timezone = timezones.get(trial.id);
      return timezone ? { ...trial, timezone } : trial;
    }),
    classes: input.classes.map(classItem =>
      classItem.judgeName.trim()
        ? classItem
        : { ...classItem, judgeName: rosterJudges.get(classItem.id) ?? classItem.judgeName }
    ),
  };
}
