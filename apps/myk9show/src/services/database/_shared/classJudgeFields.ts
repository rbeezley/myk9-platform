/**
 * Judge fields for one class row, from the assignment graph only.
 *
 * MYK9-479 dropped `classes.judge_name`, so a class has exactly two possible judge sources:
 *
 *   1. `_judge` — names resolved through the `get_show_judges` RPC (see
 *      `fetchShowJudgeNameParts`). This is the ONLY source that works for an ordinary
 *      exhibitor: `people_select` admits only the caller's own row and show managers, so a
 *      `judge_assignments(people(...))` embed resolves to `null` for everyone else, and a
 *      `people!inner` embed drops the assignment row entirely (MYK9-474, MYK9-494).
 *   2. the embedded `judge_assignments` row — used for `person_id`, and for names only when a
 *      caller who CAN read `people` embedded them.
 *
 * Only a `confirmed` assignment names a judge. An invited, declined or cancelled assignment
 * must never put a name on a running order — matching `emergency_packet_input`,
 * `judge_day_summary` and the rebuilt stats views.
 *
 * Two invariants this file exists to hold:
 *   * Name and person id always come from the SAME source. A class carrying two confirmed
 *     assignments must never render one judge's name beside another judge's id.
 *   * `resolved` distinguishes "the RPC ran and found no confirmed judge" from "the RPC never
 *     ran". Only the first is a reason to clear a cached name; see
 *     `ReplicatedClassesTable.resolveConflict`.
 */
import type { JudgeNameParts } from './judgeNamesByClass';

export interface ClassJudgeFields {
  name: string | undefined;
  personId: string | undefined;
  firstName: string | undefined;
  lastName: string | undefined;
  /** True only when the get_show_judges enrichment actually ran for this class's show. */
  resolved: boolean;
}

export interface ClassJudgeAssignmentEmbed {
  id?: string | null | undefined;
  person_id?: string | null | undefined;
  status?: string | null | undefined;
  people?: { first_name?: string | null; last_name?: string | null } | null | undefined;
}

export interface ClassJudgeSource {
  judge_assignments?: unknown;
  /** Enrichment from `get_show_judges`: parts when confirmed, `null` when resolved-but-none. */
  _judge?: JudgeNameParts | null | undefined;
  /** Whether the enrichment ran at all for this class's show. */
  _judgeResolved?: boolean | undefined;
}

/**
 * Lowest `id` wins, so a class with two confirmed assignments resolves to the same one on every
 * device and on every read — the same tie-break `fetchShowJudgeNameParts` applies to the RPC.
 */
function pickConfirmedAssignment(
  assignments: readonly ClassJudgeAssignmentEmbed[]
): ClassJudgeAssignmentEmbed | undefined {
  let chosen: ClassJudgeAssignmentEmbed | undefined;
  for (const assignment of assignments) {
    if (assignment.status !== 'confirmed') continue;
    if (chosen === undefined) {
      chosen = assignment;
      continue;
    }
    const chosenId = chosen.id ?? '';
    const candidateId = assignment.id ?? '';
    if (candidateId && candidateId < chosenId) chosen = assignment;
  }
  return chosen;
}

export function resolveClassJudgeFields(row: ClassJudgeSource): ClassJudgeFields {
  const assignments = Array.isArray(row.judge_assignments)
    ? (row.judge_assignments as ClassJudgeAssignmentEmbed[])
    : [];
  const resolved = row._judgeResolved === true;
  const enriched = row._judge ?? undefined;

  // The RPC already filtered to `confirmed` and carries its own person_id, so an enriched row
  // is authoritative and self-consistent — an exhibitor holds the name without ever being able
  // to read the embedded people row.
  if (enriched) {
    const name = `${enriched.firstName ?? ''} ${enriched.lastName ?? ''}`.trim();
    return {
      name: name || undefined,
      personId: enriched.personId,
      firstName: enriched.firstName ?? undefined,
      lastName: enriched.lastName ?? undefined,
      resolved: true,
    };
  }

  const confirmed = pickConfirmedAssignment(assignments);
  if (!confirmed) {
    return {
      name: undefined,
      personId: undefined,
      firstName: undefined,
      lastName: undefined,
      resolved,
    };
  }

  const firstName = confirmed.people?.first_name ?? undefined;
  const lastName = confirmed.people?.last_name ?? undefined;
  const name = `${firstName ?? ''} ${lastName ?? ''}`.trim();
  return {
    name: name || undefined,
    personId: confirmed.person_id ?? undefined,
    firstName,
    lastName,
    resolved,
  };
}
