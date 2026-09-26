import { createDatabaseError, supabase } from '../supabaseClient';
import { buildAssignedJudges } from '@/utils/buildAssignedJudges';
import type { ReplicatedJudgeAssignment } from '@/services/replication/ReplicatedJudgeAssignmentsTable';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import { diffShowJudges } from './showJudgeChanges';

interface ServerJudgeRow {
  person_id: string;
  show_id: string;
  class_id: string | null;
  invited_at: string | null;
  confirmed_at: string | null;
  judge: { id: string; first_name: string | null; last_name: string | null } | null;
}

/**
 * The judges a published premium lists, taken from the server.
 *
 * The Edit Show form's judge list comes from a device read, and a failed read
 * leaves it empty, so publishing it put out a premium with no judges
 * (MYK9-774). Publishing needs the network anyway, so the server list is the
 * source. The secretary's own changes in this save are applied on top: the
 * judge edits are queued writes and may not have reached the server yet.
 *
 * Throws when the server cannot be read; the caller reports a publish failure.
 */
export async function fetchShowJudgesForPublish(
  showId: string,
  loaded: ReadonlyArray<{ judgeId: string }>,
  saved: ReadonlyArray<ShowJudgeAssignment>
): Promise<ShowJudgeAssignment[]> {
  const { data, error } = await supabase
    .from('judge_assignments')
    .select(
      `person_id, show_id, class_id, invited_at, confirmed_at,
       judge:people!judge_assignments_person_id_fkey(id, first_name, last_name)`
    )
    .eq('show_id', showId);
  if (error) throw createDatabaseError(error, 'judge_assignments', 'select_for_premium_publish');

  const rows = (data ?? []) as unknown as ServerJudgeRow[];
  const assignments = rows.map(
    row =>
      ({
        personId: row.person_id,
        showId: row.show_id,
        classId: row.class_id,
        invitedAt: row.invited_at,
        confirmedAt: row.confirmed_at,
      }) as ReplicatedJudgeAssignment
  );
  const people = rows.flatMap(row =>
    row.judge
      ? [
          {
            id: row.judge.id,
            firstName: row.judge.first_name ?? '',
            lastName: row.judge.last_name ?? '',
          },
        ]
      : []
  );
  const serverJudges = buildAssignedJudges(assignments, showId, people);

  const { add, remove } = diffShowJudges(loaded, saved);
  const removed = new Set(remove);
  const kept = serverJudges.filter(judge => !removed.has(judge.judgeId));
  const present = new Set(kept.map(judge => judge.judgeId));
  const added = saved.filter(judge => add.includes(judge.judgeId) && !present.has(judge.judgeId));
  return [...kept, ...added];
}
