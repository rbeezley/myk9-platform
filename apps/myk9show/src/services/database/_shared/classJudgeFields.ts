/**
 * Judge fields for one class row, from the assignment graph only.
 *
 * MYK9-479 dropped `classes.judge_name`, so a class has exactly two possible judge sources:
 *
 *   1. `_judge` — names resolved through the `get_show_judges` RPC (see
 *      `fetchJudgeNamePartsByClass`). This is the ONLY source that works for an ordinary
 *      exhibitor: `people_select` admits only the caller's own row and show managers, so a
 *      `judge_assignments(people(...))` embed resolves to `null` for everyone else, and a
 *      `people!inner` embed drops the assignment row entirely (MYK9-474, MYK9-494).
 *   2. the embedded `judge_assignments` row — used for `person_id`, and for names only when a
 *      caller who CAN read `people` embedded them.
 *
 * Only a `confirmed` assignment names a judge. An invited, declined or cancelled assignment
 * must never put a name on a running order — matching `emergency_packet_input`,
 * `judge_day_summary` and the rebuilt stats views.
 */
import type { JudgeNameParts } from './judgeNamesByClass';

export interface ClassJudgeFields {
  name: string | undefined;
  personId: string | undefined;
  firstName: string | undefined;
  lastName: string | undefined;
}

export interface ClassJudgeAssignmentEmbed {
  person_id?: string | null | undefined;
  status?: string | null | undefined;
  people?: { first_name?: string | null; last_name?: string | null } | null | undefined;
}

export interface ClassJudgeSource {
  judge_assignments?: unknown;
  /** Enrichment written by the replication sync / timeline read from `get_show_judges`. */
  _judge?: JudgeNameParts | null | undefined;
}

const NO_JUDGE: ClassJudgeFields = {
  name: undefined,
  personId: undefined,
  firstName: undefined,
  lastName: undefined,
};

export function resolveClassJudgeFields(row: ClassJudgeSource): ClassJudgeFields {
  const assignments = Array.isArray(row.judge_assignments)
    ? (row.judge_assignments as ClassJudgeAssignmentEmbed[])
    : [];
  const confirmed = assignments.find(assignment => assignment.status === 'confirmed');

  // The RPC already filtered to `confirmed`, so an enriched name is authoritative on its own —
  // an exhibitor may hold the name without being able to read the embedded people row.
  const enriched = row._judge ?? undefined;

  const firstName = enriched?.firstName ?? confirmed?.people?.first_name ?? undefined;
  const lastName = enriched?.lastName ?? confirmed?.people?.last_name ?? undefined;
  const personId = confirmed?.person_id ?? enriched?.personId ?? undefined;

  if (!firstName && !lastName && !personId) return NO_JUDGE;

  const name = `${firstName ?? ''} ${lastName ?? ''}`.trim();
  return {
    name: name || undefined,
    personId: personId ?? undefined,
    firstName: firstName ?? undefined,
    lastName: lastName ?? undefined,
  };
}
