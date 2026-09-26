import { createDatabaseError, supabase } from '../supabaseClient';
import { buildAssignedJudges } from '@/utils/buildAssignedJudges';
import { PremiumPublishError } from '@/features/premium/premiumPublishErrors';
import type { ReplicatedJudgeAssignment } from '@/services/replication/ReplicatedJudgeAssignmentsTable';
import { mutationManager } from '@/services/replication/sharedMutationManager';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import { readJudgeAssignmentsOrThrow } from './assignmentReads';

interface ServerJudgeRow {
  person_id: string;
  show_id: string;
  class_id: string | null;
  invited_at: string | null;
  confirmed_at: string | null;
  judge: { id: string; first_name: string | null; last_name: string | null } | null;
}

/** One assignment as `judge|class`, so a class moved between judges counts as a change. */
const assignmentKey = (personId: string, classId: string | null | undefined) =>
  `${personId}|${classId ?? ''}`;

async function readServerJudges(
  showId: string
): Promise<{ judges: ShowJudgeAssignment[]; keys: Set<string> }> {
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
  return {
    judges: buildAssignedJudges(assignments, showId, people),
    keys: new Set(rows.map(row => assignmentKey(row.person_id, row.class_id))),
  };
}

/** This device's assignments for the show, or null when the device cannot read them. */
async function readDeviceAssignmentKeys(showId: string): Promise<Set<string> | null> {
  try {
    const assignments = await readJudgeAssignmentsOrThrow();
    return new Set(
      assignments.filter(a => a.showId === showId).map(a => assignmentKey(a.personId, a.classId))
    );
  } catch {
    return null;
  }
}

function sameKeys(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every(id => b.has(id));
}

/**
 * The judges a published premium lists: the server's, and only when this
 * device holds the same assignments (which judge has which class).
 *
 * The Edit Show form's judge list comes from a device read, and a failed read
 * leaves it empty, so publishing it put out a premium with no judges
 * (MYK9-774). The server is the source instead. When the device CAN read its
 * judges and they differ from the server's, some change has not landed on one
 * side: an edit still uploading or queued, one the server refused, or another
 * device's edit not yet synced here. Publishing then stops, rather than
 * guessing which side is right, and asks for an upload. When the device cannot
 * read its judges at all, the server's list stands.
 *
 * Throws a `judges-syncing` PremiumPublishError when the two disagree, and a
 * database error when the server cannot be read.
 */
export async function fetchShowJudgesForPublish(showId: string): Promise<ShowJudgeAssignment[]> {
  const [server, deviceKeys] = await Promise.all([
    readServerJudges(showId),
    readDeviceAssignmentKeys(showId),
  ]);
  if (deviceKeys && !sameKeys(deviceKeys, server.keys)) {
    mutationManager.requestUpload();
    throw new PremiumPublishError(
      "This device's judges don't match the server's yet",
      'experience-snapshot',
      'judges-syncing'
    );
  }
  return server.judges;
}
