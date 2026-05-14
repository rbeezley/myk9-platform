// Show-related database queries
// SELECT functions read from the replication store (IndexedDB) with PostgREST fallback.
import type { DatabaseError } from '../supabaseClient';
import { replicatedShowsTable } from '@/services/replication/ReplicatedShowsTable';
import { replicatedClubsTable } from '@/services/replication/ReplicatedClubsTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { replicatedJudgeAssignmentsTable } from '@/services/replication/ReplicatedJudgeAssignmentsTable';
import { mapReplicatedShowToDbRow } from '@/services/mappers/showMappers';
import { buildMapFromArray } from '../queries/queryUtils';
import { withReplicationFallback } from '../queries/replicationUtils';
import type { ReplicatedShow } from '@/services/replication/ReplicatedShowsTable';
import type { ReplicatedClub } from '@/services/replication/ReplicatedClubsTable';
import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';
import type { ReplicatedJudgeAssignment } from '@/services/replication/ReplicatedJudgeAssignmentsTable';
import {
  postgrestGetAllShows,
  postgrestGetShowById,
  postgrestGetShowsByClub,
  postgrestGetShowsByDateRange,
  postgrestGetShowsByStatus,
  postgrestGetShowsWithEntryCounts,
  postgrestGetShowStatistics,
  postgrestGetUpcomingShows,
  postgrestGetPublicShows,
  postgrestGetSecretaryShows,
  postgrestSearchShows,
} from './reads.postgrest';

// ---------------------------------------------------------------------------
// Helpers — batch-load related data into Maps to avoid N+1 reads
// ---------------------------------------------------------------------------

const EMPTY_JUDGE_MAP = new Map<string, ReplicatedJudgeAssignment[]>();
const EMPTY_TRIALS_MAP = new Map<string, ReplicatedTrial[]>();

async function loadClubsMap(): Promise<Map<string, ReplicatedClub>> {
  const clubs = await replicatedClubsTable.getAllClubs();
  return buildMapFromArray(clubs, c => c.id);
}

async function loadTrialsByShowMap(): Promise<Map<string, ReplicatedTrial[]>> {
  const trials = await replicatedTrialsTable.getAll();
  const map = new Map<string, ReplicatedTrial[]>();
  for (const t of trials) {
    if (t.showId) {
      const list = map.get(t.showId) ?? [];
      list.push(t);
      map.set(t.showId, list);
    }
  }
  return map;
}

async function loadJudgeAssignmentsByShowMap(): Promise<Map<string, ReplicatedJudgeAssignment[]>> {
  const assignments = await replicatedJudgeAssignmentsTable.getAll();
  const map = new Map<string, ReplicatedJudgeAssignment[]>();
  for (const a of assignments) {
    if (a.showId) {
      const list = map.get(a.showId) ?? [];
      list.push(a);
      map.set(a.showId, list);
    }
  }
  return map;
}

function getJoinedJudgeAssignments(row: unknown): unknown[] {
  if (!row || typeof row !== 'object') return [];
  const assignments = (row as Record<string, unknown>).judge_assignments;
  return Array.isArray(assignments) ? assignments : [];
}

/**
 * Map an array of ReplicatedShow to DB-row-shaped objects using pre-loaded
 * lookup maps. Set `clubDetail` to true for the detailed club sub-object.
 */
function mapShowsWithJoins(
  shows: ReplicatedShow[],
  clubsMap: Map<string, ReplicatedClub>,
  trialsMap: Map<string, ReplicatedTrial[]>,
  judgeAssignmentsMap: Map<string, ReplicatedJudgeAssignment[]>,
  clubDetail = false
): Record<string, unknown>[] {
  return shows.map(show =>
    mapReplicatedShowToDbRow(show, {
      club: show.clubId ? (clubsMap.get(show.clubId) ?? null) : null,
      trials: trialsMap.get(show.id) ?? [],
      judgeAssignments: judgeAssignmentsMap.get(show.id) ?? [],
      clubDetail,
    })
  );
}

// ---------------------------------------------------------------------------
// SELECT functions — read from replication store, fallback to PostgREST
// ---------------------------------------------------------------------------

// Get public shows for unauthenticated browse views.
export const getPublicShows = async () => {
  try {
    return await postgrestGetPublicShows();
  } catch (error) {
    return { data: [], error: error as DatabaseError };
  }
};

// Get all shows with club and trial information (excluding soft-deleted)
export const getAllShows = async () => {
  try {
    return await withReplicationFallback(
      async () => {
        const [shows, clubsMap, trialsMap, judgeAssignmentsMap] = await Promise.all([
          replicatedShowsTable.getAllShows(),
          loadClubsMap(),
          loadTrialsByShowMap(),
          loadJudgeAssignmentsByShowMap(),
        ]);
        const data = mapShowsWithJoins(shows, clubsMap, trialsMap, judgeAssignmentsMap);
        return { data, error: null };
      },
      postgrestGetAllShows,
      'show',
      'select_all_detailed'
    );
  } catch (error) {
    return { data: [], error: error as DatabaseError };
  }
};

// Get show by ID with complete details (excluding soft-deleted)
export const getShowById = async (id: string) => {
  try {
    return await withReplicationFallback(
      async () => {
        const show = await replicatedShowsTable.getShowById(id);
        if (!show) {
          const remote = await postgrestGetShowById(id);
          return {
            data: Array.isArray(remote.data) ? null : remote.data,
            error: remote.error,
          };
        }

        const [club, trials, judgeAssignments] = await Promise.all([
          show.clubId ? replicatedClubsTable.getClubById(show.clubId) : Promise.resolve(null),
          replicatedTrialsTable.getTrialsByShow(id),
          replicatedJudgeAssignmentsTable.getByShowId(id),
        ]);

        const data = mapReplicatedShowToDbRow(show, {
          club,
          trials,
          judgeAssignments,
          clubDetail: true,
        });

        try {
          const remote = await postgrestGetShowById(id);
          const remoteJudgeAssignments = getJoinedJudgeAssignments(remote.data);
          data.judge_assignments = remoteJudgeAssignments;
        } catch {
          // Offline/failed network: keep the replicated detail row.
        }

        return { data, error: null };
      },
      () => postgrestGetShowById(id),
      'show',
      'select_by_id_complete'
    );
  } catch (error) {
    return { data: null, error: error as DatabaseError };
  }
};

// Get upcoming shows (excluding soft-deleted)
export const getUpcomingShows = async (limit = 10) => {
  try {
    return await withReplicationFallback(
      async () => {
        const [shows, clubsMap, trialsMap] = await Promise.all([
          replicatedShowsTable.getUpcomingShows(),
          loadClubsMap(),
          loadTrialsByShowMap(),
        ]);
        const limited = shows.slice(0, limit);
        const data = mapShowsWithJoins(limited, clubsMap, trialsMap, EMPTY_JUDGE_MAP);
        return { data, error: null };
      },
      () => postgrestGetUpcomingShows(limit),
      'show',
      'select_upcoming'
    );
  } catch (error) {
    return { data: [], error: error as DatabaseError };
  }
};

// Get shows by date range (excluding soft-deleted)
export const getShowsByDateRange = async (startDate: string, endDate: string) => {
  try {
    return await withReplicationFallback(
      async () => {
        const [allShows, clubsMap, trialsMap] = await Promise.all([
          replicatedShowsTable.getAllShows(),
          loadClubsMap(),
          loadTrialsByShowMap(),
        ]);
        const filtered = allShows.filter(
          show => show.startDate >= startDate && show.endDate <= endDate
        );
        const data = mapShowsWithJoins(filtered, clubsMap, trialsMap, EMPTY_JUDGE_MAP);
        return { data, error: null };
      },
      () => postgrestGetShowsByDateRange(startDate, endDate),
      'show',
      'select_by_date_range'
    );
  } catch (error) {
    return { data: [], error: error as DatabaseError };
  }
};

// Get shows by club (excluding soft-deleted)
export const getShowsByClub = async (clubId: string) => {
  try {
    return await withReplicationFallback(
      async () => {
        const [shows, clubsMap, trialsMap] = await Promise.all([
          replicatedShowsTable.getShowsByClub(clubId),
          loadClubsMap(),
          loadTrialsByShowMap(),
        ]);
        // Sort descending by start_date (matching original PostgREST behavior)
        shows.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
        const data = mapShowsWithJoins(shows, clubsMap, trialsMap, EMPTY_JUDGE_MAP);
        return { data, error: null };
      },
      () => postgrestGetShowsByClub(clubId),
      'show',
      'select_by_club'
    );
  } catch (error) {
    return { data: [], error: error as DatabaseError };
  }
};

// Search shows by name or location (excluding soft-deleted)
export const searchShows = async (searchTerm: string) => {
  try {
    return await withReplicationFallback(
      async () => {
        const allShows = await replicatedShowsTable.getAllShows();
        const term = searchTerm.toLowerCase();
        const filtered = allShows.filter(
          show =>
            show.name.toLowerCase().includes(term) ||
            (show.location && show.location.toLowerCase().includes(term))
        );
        // Return bare rows (no joins) matching original searchShows select('*')
        const data = filtered.map(show => mapReplicatedShowToDbRow(show));
        return { data, error: null };
      },
      () => postgrestSearchShows(searchTerm),
      'show',
      'search'
    );
  } catch (error) {
    return { data: [], error: error as DatabaseError };
  }
};

// Get show statistics (excluding soft-deleted)
export const getShowStatistics = async () => {
  try {
    return await withReplicationFallback(
      async () => {
        const allShows = await replicatedShowsTable.getAllShows();
        return { data: { total: allShows.length }, error: null };
      },
      postgrestGetShowStatistics,
      'show',
      'statistics'
    );
  } catch (error) {
    return { data: null, error: error as DatabaseError };
  }
};

// Get shows with entry counts (simplified, excluding soft-deleted)
export const getShowsWithEntryCounts = async () => {
  try {
    return await withReplicationFallback(
      async () => {
        const [shows, clubsMap] = await Promise.all([
          replicatedShowsTable.getAllShows(),
          loadClubsMap(),
        ]);
        const rows = mapShowsWithJoins(shows, clubsMap, EMPTY_TRIALS_MAP, EMPTY_JUDGE_MAP);
        // Add basic entry count as 0 for now (matching original behavior)
        const data = rows.map(row => ({ ...row, entry_count: 0 }));
        return { data, error: null };
      },
      postgrestGetShowsWithEntryCounts,
      'show',
      'select_with_entry_counts'
    );
  } catch (error) {
    return { data: [], error: error as DatabaseError };
  }
};

// Get shows by status (excluding soft-deleted)
export const getShowsByStatus = async (status: string) => {
  try {
    return await withReplicationFallback(
      async () => {
        const allShows = await replicatedShowsTable.getAllShows();
        const filtered = allShows.filter(show => show.status === status);
        // Return bare rows (no joins) matching original getShowsByStatus select('*')
        const data = filtered.map(show => mapReplicatedShowToDbRow(show));
        return { data, error: null };
      },
      () => postgrestGetShowsByStatus(status),
      'show',
      'select_by_status'
    );
  } catch (error) {
    return { data: [], error: error as DatabaseError };
  }
};

// Get shows where user is a secretary (excluding soft-deleted)
export const getSecretaryShows = async (_userId: string) => {
  try {
    return await withReplicationFallback(
      async () => {
        const allShows = await replicatedShowsTable.getAllShows();
        if (allShows.length === 0) {
          return await postgrestGetSecretaryShows();
        }

        // Sort descending by start_date (matching original PostgREST behavior)
        const sorted = [...allShows].sort(
          (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
        );
        // Return only the fields the original query selected
        const data = sorted.map(show => ({
          id: show.id,
          name: show.name,
          start_date: show.startDate,
          end_date: show.endDate,
        }));
        return { data, error: null };
      },
      postgrestGetSecretaryShows,
      'show',
      'select_secretary_shows'
    );
  } catch (error) {
    return { data: [], error: error as DatabaseError };
  }
};
