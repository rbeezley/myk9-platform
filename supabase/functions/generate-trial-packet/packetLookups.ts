import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';

import { HttpError } from '../_shared/http/responses.ts';
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

function cleaned(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The judge each class has on the show's roster, as `show.assignedJudges` gives the browser:
 * any assignment row for the class, whatever its status (the browser's roster does not filter
 * either). The first row with a name wins.
 */
async function loadRosterJudgesByClass(
  supabase: SupabaseClient,
  showId: string
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('judge_assignments')
    .select('class_id, person:people!judge_assignments_person_id_fkey(first_name, last_name)')
    .eq('show_id', showId);
  if (error) throw new HttpError(500, 'Failed to load the show judges.');
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
  if (error) throw new HttpError(500, 'Failed to load the trial time zones.');
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
