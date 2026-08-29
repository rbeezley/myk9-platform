import { supabase } from '../supabaseClient';

/**
 * Resolve class -> trial -> show for a single class straight from the server.
 *
 * Why this exists (F27, second pass). The scoring breadcrumb derives `showId` from
 * the class row, reading it out of the local replica. On a cold store that read
 * returns null WITHOUT throwing, so the breadcrumb reported `showId: undefined`
 * and every caller keyed on it was stuck: the page could not hydrate the show
 * whose replica would contain the class, because it needed the class to learn
 * which show that was. `services/database/classes/reads.ts` already breaks the
 * same circularity for the public class page by self-falling through to
 * PostgREST; this is the scoring-shaped version of that fallback.
 *
 * COLUMN NOTE: `public.classes` grants `authenticated` no table-level SELECT
 * (`relacl` is `awd`) -- only a column allowlist. Selecting `*`, or any column
 * outside that list, fails the WHOLE request with 42501. `id`, `name` and
 * `trial_id` are granted; `trials` and `shows` do hold table-level SELECT, so
 * embedding them is safe.
 */
export interface ScoringHierarchy {
  classId: string;
  className: string | undefined;
  trialId: string | undefined;
  trialLabel: string | undefined;
  showId: string | undefined;
  showName: string | undefined;
}

interface TrialEmbed {
  id: string | null;
  name: string | null;
  trial_number: string | number | null;
  show_id: string | null;
  shows: { id: string | null; name: string | null } | null;
}

/** Matches the breadcrumb's own labelling: "Trial 3" when numbered, else the name. */
export function toTrialLabel(trial: {
  name?: string | null;
  trial_number?: string | number | null;
}): string | undefined {
  if (trial.trial_number !== null && trial.trial_number !== undefined && trial.trial_number !== '') {
    return `Trial ${trial.trial_number}`;
  }
  return trial.name ?? undefined;
}

export async function fetchScoringHierarchy(classId: string): Promise<ScoringHierarchy | null> {
  const { data, error } = await supabase
    .from('classes')
    .select('id, name, trial_id, trial:trials(id, name, trial_number, show_id, shows(id, name))')
    .eq('id', classId)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as unknown as {
    id: string;
    name: string | null;
    trial_id: string | null;
    trial: TrialEmbed | TrialEmbed[] | null;
  };
  // PostgREST returns a to-one embed as an object, but typegen and some join
  // shapes surface it as a single-element array. Accept both.
  const trial = Array.isArray(row.trial) ? (row.trial[0] ?? null) : row.trial;
  const show = trial ? (Array.isArray(trial.shows) ? trial.shows[0] : trial.shows) : null;

  return {
    classId: row.id,
    className: row.name ?? undefined,
    trialId: trial?.id ?? row.trial_id ?? undefined,
    trialLabel: trial ? toTrialLabel(trial) : undefined,
    showId: trial?.show_id ?? show?.id ?? undefined,
    showName: show?.name ?? undefined,
  };
}
