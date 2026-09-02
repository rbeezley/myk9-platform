/**
 * Judge Qualification & Certification Database Queries
 *
 * Database operations for judge qualifications and certifications supporting
 * multiple organizations with filtering, suspension, and summary analytics.
 *
 * Note: These tables are not in generated Supabase types, so we use
 * type assertions via untypedFrom() for .from() calls.
 */

import {
  JudgeQualification,
  CreateJudgeQualificationData,
  UpdateJudgeQualificationData,
  JudgeQualificationFilters,
  JudgeQualificationSummary,
} from '../../../types/judge-management';
import { untypedFrom } from '../_shared/untyped-from';
import { createDatabaseError, logQuery, supabase } from '../supabaseClient';
import type { DbJudgeAvailability } from '@/types/database-mappings';
import { replicatedClassesTable, replicatedJudgeAssignmentsTable } from '@/services/replication';
import { ACTIVE_JUDGE_ASSIGNMENT_STATUSES } from './assignmentStatus';

// Helper to access tables not in generated types
const qualificationsTable = () => untypedFrom('judge_qualifications');
const certificationsTable = () => untypedFrom('judge_certifications');
const JUDGE_ASSIGNMENT_PUBLIC_SELECT =
  'id, person_id, show_id, trial_id, class_id, status, invited_at, confirmed_at, created_at, updated_at, day_capacity_override, version';

type ManagerJudgeAssignmentRpc = {
  data: Array<Record<string, unknown>> | null;
  error: { message: string } | null;
};

function getManagerJudgeAssignments(): Promise<ManagerJudgeAssignmentRpc> {
  // The RPC is introduced by a migration newer than the generated Supabase
  // schema. Keep the escape hatch local and type the result at this boundary.
  return (
    supabase as unknown as {
      rpc(name: string): Promise<ManagerJudgeAssignmentRpc>;
    }
  ).rpc('get_manager_judge_assignments');
}
// `!inner` gates the result to people who HAVE a judge_qualifications row — a
// judge is defined by their qualifications, not by holding a login/role grant.
// Most judges never create an account: they exist as a people row + their
// number/disciplines, entered by a secretary. Gating on user_roles (the prior
// behavior) made those account-less judges invisible to the assignment picker.
const JUDGE_QUALIFICATIONS_SELECT = `judge_qualifications!inner(
  id, organization, qualification_level, disciplines, judge_number,
  date_obtained, expiration_date, is_active
)`;

export async function replaceJudgeQualifications(
  personId: string,
  qualifications: CreateJudgeQualificationData[]
): Promise<void> {
  const { error } = await (supabase as unknown as {
    rpc(name: string, args: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
  }).rpc('replace_judge_qualifications', {
    p_person_id: personId,
    p_qualifications: qualifications,
  });

  if (error) throw new Error(`Failed to replace judge qualifications: ${error.message}`);
}

// Get judges with their qualifications for Secretary judge assignment UI.
// Source of truth = judge_qualifications (org/active filtering happens in the UI
// against the embedded rows); a `judge` user_roles grant is NOT required.
export const getJudgesWithQualifications = async () => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('people')
      .select(`*, ${JUDGE_QUALIFICATIONS_SELECT}`)
      .is('deleted_at', null)
      .order('last_name', { ascending: true });

    const duration = Date.now() - startTime;
    logQuery('judge', 'select_with_qualifications', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'judge', 'select_with_qualifications');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'judge', 'select_with_qualifications');
    logQuery('judge', 'select_with_qualifications', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Judge Qualification Operations

// Create new judge qualification
export async function createJudgeQualification(
  data: CreateJudgeQualificationData
): Promise<JudgeQualification> {
  const { data: qualification, error } = await qualificationsTable()
    .insert([{ ...data, is_active: data.is_active ?? true }])
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create judge qualification: ${error.message}`);
  }

  return qualification as JudgeQualification;
}

// Get qualification by ID
export async function getJudgeQualificationById(id: string): Promise<JudgeQualification | null> {
  const { data: qualification, error } = await qualificationsTable()
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw new Error(`Failed to fetch judge qualification: ${error.message}`);
  }

  return qualification as JudgeQualification;
}

// Get all qualifications for a judge
export async function getJudgeQualificationsByJudgeId(
  judgeId: string,
  filters?: JudgeQualificationFilters
): Promise<JudgeQualification[]> {
  let query = qualificationsTable().select('*').eq('person_id', judgeId);

  // Apply filters
  if (filters?.organization) {
    query = query.eq('organization', filters.organization);
  }
  if (filters?.qualification_level) {
    query = query.eq('qualification_level', filters.qualification_level);
  }
  if (filters?.discipline) {
    query = query.contains('disciplines', [filters.discipline]);
  }
  if (filters?.is_active !== undefined) {
    query = query.eq('is_active', filters.is_active);
  }
  if (filters?.suspended !== undefined) {
    if (filters.suspended) {
      query = query.not('suspension_date', 'is', null);
    } else {
      query = query.is('suspension_date', null);
    }
  }
  if (filters?.expiring_within_days) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + filters.expiring_within_days);
    query = query
      .not('expiration_date', 'is', null)
      .lte('expiration_date', futureDate.toISOString().split('T')[0]);
  }

  query = query.order('date_obtained', { ascending: false });

  const { data: qualifications, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch judge qualifications: ${error.message}`);
  }

  return (qualifications || []) as JudgeQualification[];
}

// Update qualification
export async function updateJudgeQualification(
  data: UpdateJudgeQualificationData
): Promise<JudgeQualification> {
  const { id, ...updateData } = data;

  const { data: qualification, error } = await qualificationsTable()
    .update({ ...updateData, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update judge qualification: ${error.message}`);
  }

  return qualification as JudgeQualification;
}

// Delete qualification
export async function deleteJudgeQualification(id: string): Promise<void> {
  const { error } = await qualificationsTable().delete().eq('id', id);

  if (error) {
    throw new Error(`Failed to delete judge qualification: ${error.message}`);
  }
}

// Delete all qualifications for a person
export async function deleteJudgeQualificationsByPersonId(personId: string): Promise<void> {
  const { error } = await qualificationsTable().delete().eq('person_id', personId);

  if (error) {
    throw new Error(`Failed to delete judge qualifications for person: ${error.message}`);
  }
}

// Suspend qualification
export async function suspendJudgeQualification(
  id: string,
  reason: string
): Promise<JudgeQualification> {
  const { data: qualification, error } = await qualificationsTable()
    .update({
      suspension_date: new Date().toISOString(),
      suspension_reason: reason,
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to suspend judge qualification: ${error.message}`);
  }

  return qualification as JudgeQualification;
}

// Reinstate qualification
export async function reinstateJudgeQualification(id: string): Promise<JudgeQualification> {
  const { data: qualification, error } = await qualificationsTable()
    .update({
      suspension_date: null,
      suspension_reason: null,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to reinstate judge qualification: ${error.message}`);
  }

  return qualification as JudgeQualification;
}

// Get qualification summary for a judge
export async function getJudgeQualificationSummary(
  judgeId: string
): Promise<JudgeQualificationSummary> {
  const qualifications = await getJudgeQualificationsByJudgeId(judgeId);

  const activeQualifications = qualifications.filter(q => q.is_active);
  const expiredQualifications = qualifications.filter(
    q => q.expiration_date && new Date(q.expiration_date) < new Date()
  );
  const suspendedQualifications = qualifications.filter(q => q.suspension_date);

  // Check for expiring qualifications (within 30 days)
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const expiringSoon = qualifications.filter(
    q =>
      q.expiration_date &&
      new Date(q.expiration_date) <= thirtyDaysFromNow &&
      new Date(q.expiration_date) >= new Date()
  );

  const summary: JudgeQualificationSummary = {
    total_qualifications: qualifications.length,
    active_qualifications: activeQualifications.length,
    expired_qualifications: expiredQualifications.length,
    suspended_qualifications: suspendedQualifications.length,
    expiring_soon: expiringSoon.length,
    organizations: [...new Set(qualifications.map(q => q.organization))] as string[],
    disciplines: [...new Set(qualifications.flatMap(q => q.disciplines))] as string[],
    latest_qualification: qualifications[0], // Already sorted by date desc
    qualifications_by_organization: {},
    qualifications_by_level: {},
  };

  // Calculate distributions
  qualifications.forEach(qualification => {
    summary.qualifications_by_organization[qualification.organization] =
      (summary.qualifications_by_organization[qualification.organization] || 0) + 1;

    summary.qualifications_by_level[qualification.qualification_level] =
      (summary.qualifications_by_level[qualification.qualification_level] || 0) + 1;
  });

  return summary;
}

// =============================================================================
// Judge Assignment Persistence
// =============================================================================

const assignmentsTable = () => untypedFrom('judge_assignments');

/**
 * Replace all judge assignments for a show (delete + insert).
 * Used by both the show creation wizard and the show edit form.
 * Writes are queued through `ReplicatedJudgeAssignmentsTable` so they survive
 * offline show-day use and sync on reconnect.
 */
export async function persistShowJudgeAssignments(
  showId: string,
  judges: Array<{ judgeId: string }>,
  options?: { skipDelete?: boolean }
): Promise<void> {
  try {
    if (options?.skipDelete) {
      for (const judge of judges) {
        await replicatedJudgeAssignmentsTable.createAssignment({
          personId: judge.judgeId,
          showId,
          trialId: null,
          classId: null,
          status: 'confirmed',
          invitedAt: null,
          confirmedAt: new Date().toISOString(),
          fee: null,
          notes: null,
        });
      }
      return;
    }
    await replicatedJudgeAssignmentsTable.replaceShowLevelAssignments(
      showId,
      judges.map(j => j.judgeId)
    );
  } catch (error) {
    throw createDatabaseError(error, 'judge_assignments', 'persist_show_assignments');
  }
}

/**
 * Upsert a judge assignment for a specific class.
 * Removes any existing class-level assignment, then inserts the new one.
 * Pass empty string or 'TBD' as judgeId to remove the assignment.
 * Writes are queued through `ReplicatedJudgeAssignmentsTable`.
 */
export async function upsertClassJudgeAssignment(
  showId: string,
  classId: string,
  judgeId: string
): Promise<void> {
  try {
    await replicatedJudgeAssignmentsTable.replaceClassAssignment(
      showId,
      classId,
      judgeId && judgeId !== 'TBD' ? judgeId : null
    );
  } catch (error) {
    throw createDatabaseError(error, 'judge_assignments', 'upsert_class_assignment');
  }

  // Touch the class row so replication sync picks up the judge change. Queued
  // through ReplicatedClassesTable (not a direct Supabase write) so it survives
  // offline show-day use and syncs on reconnect, same as the assignment write.
  await touchClassForJudgeSync(classId);
}

export async function reassignClassJudge(
  showId: string,
  classId: string,
  fromJudgeId: string,
  toJudgeId: string
): Promise<void> {
  try {
    await replicatedJudgeAssignmentsTable.reassignClassAssignment(
      showId,
      classId,
      fromJudgeId,
      toJudgeId
    );
  } catch (error) {
    throw createDatabaseError(error, 'judge_assignments', 'reassign_class_judge');
  }

  // Touch the class row so replication sync picks up the judge change.
  await touchClassForJudgeSync(classId);
}

/**
 * Bumps a class's updated_at via the replicated classes table so incremental
 * class sync refetches joined judge data after a judge assignment change.
 * Offline-safe: queues through ReplicatedClassesTable instead of writing
 * directly to Supabase.
 */
async function touchClassForJudgeSync(classId: string): Promise<void> {
  await replicatedClassesTable.updateClass(classId, {
    _lastModified: new Date(),
  });
}

// =============================================================================
// Judge Analytics Queries (read-only over existing tables)
// =============================================================================

export interface JudgeUtilizationFilters {
  dateRange?: { start: string; end: string };
  organization?: string;
}

export interface JudgeUtilizationRow {
  person_id: string;
  first_name: string;
  last_name: string;
  show_count: number;
  class_count: number;
  confirmed_count: number;
  declined_count: number;
  cancelled_count: number;
  total_fees: number;
}

export interface JudgeAssignmentRow {
  id: string;
  show_id: string;
  trial_id: string | null;
  class_id: string | null;
  status: string;
  fee: number | null;
  invited_at: string | null;
  confirmed_at: string | null;
  notes: string | null;
  show_name: string;
  show_start_date: string;
  show_end_date: string;
  show_organization: string;
}

export interface RosterSummary {
  totalJudges: number;
  activeQualifications: number;
  expiringSoon: number;
  totalAssignmentsThisMonth: number;
}

/** Roster overview stats for admin/secretary */
export async function getJudgeRosterSummary(): Promise<RosterSummary> {
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  // Run all 4 independent queries in parallel
  const [distinctJudgesResult, activeResult, expiringResult, monthAssignmentsResult] =
    await Promise.all([
      // Fetch distinct person_ids to count unique judges
      qualificationsTable().select('person_id'),
      qualificationsTable().select('*', { count: 'exact', head: true }).eq('is_active', true),
      qualificationsTable()
        .select('*', { count: 'exact', head: true })
        .not('expiration_date', 'is', null)
        .lte('expiration_date', thirtyDaysFromNow.toISOString().split('T')[0])
        .gte('expiration_date', new Date().toISOString().split('T')[0]),
      assignmentsTable()
        .select('id', { count: 'exact', head: true })
        .gte('created_at', monthStart.toISOString()),
    ]);

  // Count distinct person_ids client-side (PostgREST doesn't support COUNT DISTINCT)
  const uniquePersonIds = new Set(
    ((distinctJudgesResult.data || []) as Array<{ person_id: string }>).map(r => r.person_id)
  );

  return {
    totalJudges: uniquePersonIds.size,
    activeQualifications: activeResult.count ?? 0,
    expiringSoon: expiringResult.count ?? 0,
    totalAssignmentsThisMonth: monthAssignmentsResult.count ?? 0,
  };
}

/** Per-judge utilization stats for admin/secretary */
export async function getJudgeUtilizationStats(
  filters?: JudgeUtilizationFilters
): Promise<JudgeUtilizationRow[]> {
  const { data, error } = await getManagerJudgeAssignments();

  if (error) throw new Error(`Failed to fetch utilization stats: ${error.message}`);

  const rows = (data ?? []).filter(row => {
    if (filters?.dateRange) {
      const createdAt = String(row.created_at ?? '');
      if (createdAt < filters.dateRange.start || createdAt > filters.dateRange.end) return false;
    }
    return true;
  });

  const personIds = [...new Set(rows.map(row => row.person_id).filter(Boolean) as string[])];
  const showIds = [...new Set(rows.map(row => row.show_id).filter(Boolean) as string[])];
  const [peopleResult, showsResult] = await Promise.all([
    personIds.length
      ? supabase.from('people').select('id, first_name, last_name').in('id', personIds)
      : Promise.resolve({ data: [], error: null }),
    showIds.length
      ? supabase.from('shows').select('id, organization').in('id', showIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (peopleResult.error) {
    throw new Error(`Failed to fetch utilization judge names: ${peopleResult.error.message}`);
  }
  if (showsResult.error) {
    throw new Error(`Failed to fetch utilization show organizations: ${showsResult.error.message}`);
  }

  const peopleById = new Map(
    ((peopleResult.data ?? []) as Array<Record<string, unknown>>).map(person => [
      person.id as string,
      person,
    ])
  );
  const showsById = new Map(
    ((showsResult.data ?? []) as Array<Record<string, unknown>>).map(show => [
      show.id as string,
      show,
    ])
  );

  // Aggregate client-side (Supabase REST doesn't support GROUP BY)
  // Single pass: build judge stats and track unique shows per judge
  const byJudge = new Map<string, JudgeUtilizationRow>();
  const showsByJudge = new Map<string, Set<string>>();

  for (const row of rows) {
    const personId = row.person_id as string;
    const people = peopleById.get(personId) ?? null;
    const show = showsById.get(row.show_id as string) ?? null;
    const status = row.status as string;
    const fee = (row.fee as number) || 0;
    const showId = row.show_id as string;

    // Filter by organization if specified
    if (filters?.organization && show?.organization !== filters.organization) {
      continue;
    }

    if (!byJudge.has(personId)) {
      byJudge.set(personId, {
        person_id: personId,
        first_name: (people?.first_name as string) || '',
        last_name: (people?.last_name as string) || '',
        show_count: 0,
        class_count: 0,
        confirmed_count: 0,
        declined_count: 0,
        cancelled_count: 0,
        total_fees: 0,
      });
      showsByJudge.set(personId, new Set());
    }

    const entry = byJudge.get(personId)!;
    entry.class_count++;
    entry.total_fees += fee;
    showsByJudge.get(personId)!.add(showId);

    if (status === 'confirmed' || status === 'completed') {
      entry.confirmed_count++;
    } else if (status === 'declined') {
      entry.declined_count++;
    } else if (status === 'cancelled') {
      entry.cancelled_count++;
    }
  }

  // Set show counts from tracked unique show_ids
  for (const [personId, shows] of showsByJudge) {
    byJudge.get(personId)!.show_count = shows.size;
  }

  return Array.from(byJudge.values());
}

/** Qualification alerts for admin/secretary */
export async function getJudgeQualificationAlerts(withinDays: number = 30) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + withinDays);
  // Only show recently expired (within 90 days), not ancient ones
  const lowerBound = new Date();
  lowerBound.setDate(lowerBound.getDate() - 90);

  const { data, error } = await qualificationsTable()
    .select('*, people!judge_qualifications_person_id_fkey(first_name, last_name)')
    .or(
      `and(expiration_date.not.is.null,expiration_date.lte.${futureDate.toISOString().split('T')[0]},expiration_date.gte.${lowerBound.toISOString().split('T')[0]}),suspension_date.not.is.null`
    )
    .order('expiration_date', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch qualification alerts: ${error.message}`);
  }

  return (data || []) as Array<
    JudgeQualification & { people: { first_name: string; last_name: string } | null }
  >;
}

/** Personal stats for a judge */
export async function getJudgeStats(
  personId: string,
  year?: number
): Promise<{
  showsJudged: number;
  classesJudged: number;
  totalFees: number | null;
  statusBreakdown: Record<string, number>;
}> {
  const targetYear = year ?? new Date().getFullYear();
  const yearStart = `${targetYear}-01-01T00:00:00Z`;
  const yearEnd = `${targetYear}-12-31T23:59:59Z`;

  const { data, error } = await assignmentsTable()
    .select(JUDGE_ASSIGNMENT_PUBLIC_SELECT)
    .eq('person_id', personId)
    .gte('created_at', yearStart)
    .lte('created_at', yearEnd);

  if (error) {
    throw new Error(`Failed to fetch judge stats: ${error.message}`);
  }

  const rows = (data || []) as Array<Record<string, unknown>>;
  const uniqueShows = new Set(rows.map(r => r.show_id as string));

  const statusBreakdown: Record<string, number> = {};
  for (const row of rows) {
    const status = row.status as string;
    statusBreakdown[status] = (statusBreakdown[status] || 0) + 1;
  }

  return {
    showsJudged: uniqueShows.size,
    classesJudged: rows.length,
    // Fees are private manager data. Keep the personal dashboard shape stable
    // while making the withheld value explicit instead of querying fee.
    totalFees: null,
    statusBreakdown,
  };
}

/** Upcoming assignments for a judge */
export async function getJudgeUpcomingAssignments(personId: string): Promise<JudgeAssignmentRow[]> {
  const { data, error } = await assignmentsTable()
    .select(
      `${JUDGE_ASSIGNMENT_PUBLIC_SELECT}, shows!judge_assignments_show_id_fkey(name, start_date, end_date, organization)`
    )
    .eq('person_id', personId)
    .in('status', [...ACTIVE_JUDGE_ASSIGNMENT_STATUSES])
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch upcoming assignments: ${error.message}`);
  }

  const today = new Date().toISOString().split('T')[0];

  return (
    ((data || []) as Array<Record<string, unknown>>)
      .map(row => {
        const show = row.shows as Record<string, unknown> | null;
        return {
          id: row.id as string,
          show_id: row.show_id as string,
          trial_id: row.trial_id as string | null,
          class_id: row.class_id as string | null,
          status: row.status as string,
          fee: null,
          invited_at: row.invited_at as string | null,
          confirmed_at: row.confirmed_at as string | null,
          notes: null,
          show_name: (show?.name as string) || 'Unknown Show',
          show_start_date: (show?.start_date as string) || '',
          show_end_date: (show?.end_date as string) || '',
          show_organization: (show?.organization as string) || '',
        };
      })
      // Filter out past shows and sort by show date
      .filter(a => !a.show_end_date || a.show_end_date >= today)
      .sort((a, b) => a.show_start_date.localeCompare(b.show_start_date))
  );
}

/** Monthly assignment trends for chart (current year) */
export async function getJudgeAssignmentTrends(
  year?: number
): Promise<Array<{ month: string; count: number }>> {
  const targetYear = year ?? new Date().getFullYear();
  const yearStart = `${targetYear}-01-01T00:00:00Z`;
  const yearEnd = `${targetYear}-12-31T23:59:59Z`;

  const { data, error } = await assignmentsTable()
    .select('created_at')
    .gte('created_at', yearStart)
    .lte('created_at', yearEnd);

  if (error) {
    throw new Error(`Failed to fetch assignment trends: ${error.message}`);
  }

  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const counts = new Array<number>(12).fill(0);

  for (const row of (data || []) as Array<Record<string, unknown>>) {
    const date = new Date(row.created_at as string);
    counts[date.getMonth()]++;
  }

  return months.map((month, i) => ({ month, count: counts[i] }));
}

// =============================================================================
// Judge Certification Operations (judge_certifications table from migration 005)
// =============================================================================

export interface CreateJudgeCertificationDbData {
  person_id: string;
  organization: string;
  sport: string;
  level?: string | undefined;
  certification_number?: string | undefined;
  certification_date?: string | undefined;
  expiration_date?: string | undefined;
}

// =============================================================================
// Judge Availability Operations (judge_availability table from migration 050)
// =============================================================================

export interface JudgeAvailabilityUpsertData {
  person_id: string;
  start_date?: string | null;
  end_date?: string | null;
  max_shows_per_month?: number;
  travel_radius_miles?: number;
  availability_status?: string;
  blackout_dates?: string[];
}

export async function upsertJudgeAvailability(
  data: JudgeAvailabilityUpsertData
): Promise<DbJudgeAvailability> {
  const { data: availability, error } = await supabase
    .from('judge_availability')
    .upsert(data, { onConflict: 'person_id' })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to upsert judge availability: ${error.message}`);
  }

  return availability;
}

export async function getJudgeAvailabilityByPersonId(
  personId: string
): Promise<DbJudgeAvailability | null> {
  const { data, error } = await supabase
    .from('judge_availability')
    .select('*')
    .eq('person_id', personId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch judge availability: ${error.message}`);
  }

  return data;
}

export async function deleteJudgeAvailability(personId: string): Promise<void> {
  const { error } = await supabase.from('judge_availability').delete().eq('person_id', personId);

  if (error) {
    throw new Error(`Failed to delete judge availability: ${error.message}`);
  }
}

export async function createJudgeCertification(
  data: CreateJudgeCertificationDbData
): Promise<Record<string, unknown>> {
  const { data: cert, error } = await certificationsTable().insert([data]).select().single();

  if (error) {
    throw new Error(`Failed to create judge certification: ${error.message}`);
  }

  return cert as Record<string, unknown>;
}

export async function getJudgeCertificationsByPersonId(
  personId: string
): Promise<Record<string, unknown>[]> {
  const { data, error } = await certificationsTable()
    .select('*')
    .eq('person_id', personId)
    .order('certification_date', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch judge certifications: ${error.message}`);
  }

  return (data || []) as Record<string, unknown>[];
}
