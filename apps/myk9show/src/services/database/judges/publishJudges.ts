import { createDatabaseError, supabase } from '../supabaseClient';
import { buildAssignedJudges } from '@/utils/buildAssignedJudges';
import type { ReplicatedJudgeAssignment } from '@/services/replication/ReplicatedJudgeAssignmentsTable';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import { mutationManager } from '@/services/replication/sharedMutationManager';

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
 * source. Judge edits are queued writes, from this save or an earlier one, so
 * they are uploaded first; if one is still waiting, the server list would miss
 * it, and publishing stops instead. A DELETE names only its row, so any waiting
 * judge write that does not name another show counts.
 *
 * Throws when the edits have not reached the server or the server cannot be
 * read; the caller reports a publish failure.
 */
export async function fetchShowJudgesForPublish(showId: string): Promise<ShowJudgeAssignment[]> {
  await mutationManager.uploadPendingMutations();
  const waiting = await mutationManager.getPendingMutationsForTable('judge_assignments');
  if (waiting.some(mutation => (mutation.data.show_id ?? showId) === showId)) {
    throw new Error(
      "Some judge changes haven't reached the server yet. Try publishing again in a moment."
    );
  }

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
  return buildAssignedJudges(assignments, showId, people);
}
