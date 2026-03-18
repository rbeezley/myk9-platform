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
import { untypedFrom } from './search-query-helpers';
import { supabase } from '../supabaseClient';
import type { DbJudgeAvailability } from '@/types/database-mappings';

// Helper to access tables not in generated types
const qualificationsTable = () => untypedFrom('judge_qualifications');
const certificationsTable = () => untypedFrom('judge_certifications');

// Judge Qualification Operations
export const judgeQualificationQueries = {
  // Create new judge qualification
  async create(data: CreateJudgeQualificationData): Promise<JudgeQualification> {
    const { data: qualification, error } = await qualificationsTable()
      .insert([{ ...data, is_active: data.is_active ?? true }])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create judge qualification: ${error.message}`);
    }

    return qualification as JudgeQualification;
  },

  // Get qualification by ID
  async getById(id: string): Promise<JudgeQualification | null> {
    const { data: qualification, error } = await qualificationsTable()
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Failed to fetch judge qualification: ${error.message}`);
    }

    return qualification as JudgeQualification;
  },

  // Get all qualifications for a judge
  async getByJudgeId(
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
  },

  // Update qualification
  async update(data: UpdateJudgeQualificationData): Promise<JudgeQualification> {
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
  },

  // Delete qualification
  async delete(id: string): Promise<void> {
    const { error } = await qualificationsTable().delete().eq('id', id);

    if (error) {
      throw new Error(`Failed to delete judge qualification: ${error.message}`);
    }
  },

  // Delete all qualifications for a person
  async deleteByPersonId(personId: string): Promise<void> {
    const { error } = await qualificationsTable().delete().eq('person_id', personId);

    if (error) {
      throw new Error(`Failed to delete judge qualifications for person: ${error.message}`);
    }
  },

  // Suspend qualification
  async suspend(id: string, reason: string): Promise<JudgeQualification> {
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
  },

  // Reinstate qualification
  async reinstate(id: string): Promise<JudgeQualification> {
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
  },

  // Get qualification summary for a judge
  async getSummary(judgeId: string): Promise<JudgeQualificationSummary> {
    const qualifications = await this.getByJudgeId(judgeId);

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
  },
};

// =============================================================================
// Judge Assignment Persistence
// =============================================================================

const assignmentsTable = () => untypedFrom('judge_assignments');

/**
 * Replace all judge assignments for a show (delete + insert).
 * Used by both the show creation wizard and the show edit form.
 */
export async function persistShowJudgeAssignments(
  showId: string,
  judges: Array<{ judgeId: string }>,
  options?: { skipDelete?: boolean }
): Promise<void> {
  if (!options?.skipDelete) {
    await assignmentsTable().delete().eq('show_id', showId);
  }
  if (judges.length > 0) {
    await assignmentsTable().insert(
      judges.map(j => ({
        person_id: j.judgeId,
        show_id: showId,
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
      }))
    );
  }
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

export const judgeAnalyticsQueries = {
  /** Roster overview stats for admin/secretary */
  async getRosterSummary(): Promise<RosterSummary> {
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
          .select('*', { count: 'exact', head: true })
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
  },

  /** Per-judge utilization stats for admin/secretary */
  async getUtilizationStats(filters?: JudgeUtilizationFilters): Promise<JudgeUtilizationRow[]> {
    let query = assignmentsTable().select(
      '*, people!judge_assignments_person_id_fkey(first_name, last_name), shows!judge_assignments_show_id_fkey(organization)'
    );

    if (filters?.dateRange) {
      query = query
        .gte('created_at', filters.dateRange.start)
        .lte('created_at', filters.dateRange.end);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch utilization stats: ${error.message}`);
    }

    // Aggregate client-side (Supabase REST doesn't support GROUP BY)
    // Single pass: build judge stats and track unique shows per judge
    const byJudge = new Map<string, JudgeUtilizationRow>();
    const showsByJudge = new Map<string, Set<string>>();

    for (const row of (data || []) as Array<Record<string, unknown>>) {
      const personId = row.person_id as string;
      const people = row.people as Record<string, unknown> | null;
      const show = row.shows as Record<string, unknown> | null;
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
  },

  /** Qualification alerts for admin/secretary */
  async getQualificationAlerts(withinDays: number = 30) {
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
  },

  /** Personal stats for a judge */
  async getMyStats(
    personId: string,
    year?: number
  ): Promise<{
    showsJudged: number;
    classesJudged: number;
    totalFees: number;
    statusBreakdown: Record<string, number>;
  }> {
    const targetYear = year ?? new Date().getFullYear();
    const yearStart = `${targetYear}-01-01T00:00:00Z`;
    const yearEnd = `${targetYear}-12-31T23:59:59Z`;

    const { data, error } = await assignmentsTable()
      .select('*')
      .eq('person_id', personId)
      .gte('created_at', yearStart)
      .lte('created_at', yearEnd);

    if (error) {
      throw new Error(`Failed to fetch judge stats: ${error.message}`);
    }

    const rows = (data || []) as Array<Record<string, unknown>>;
    const uniqueShows = new Set(rows.map(r => r.show_id as string));

    const statusBreakdown: Record<string, number> = {};
    let totalFees = 0;
    for (const row of rows) {
      const status = row.status as string;
      statusBreakdown[status] = (statusBreakdown[status] || 0) + 1;
      totalFees += (row.fee as number) || 0;
    }

    return {
      showsJudged: uniqueShows.size,
      classesJudged: rows.length,
      totalFees,
      statusBreakdown,
    };
  },

  /** Upcoming assignments for a judge */
  async getUpcomingAssignments(personId: string): Promise<JudgeAssignmentRow[]> {
    const { data, error } = await assignmentsTable()
      .select('*, shows!judge_assignments_show_id_fkey(name, start_date, end_date, organization)')
      .eq('person_id', personId)
      .in('status', ['invited', 'confirmed'])
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
            fee: row.fee as number | null,
            invited_at: row.invited_at as string | null,
            confirmed_at: row.confirmed_at as string | null,
            notes: row.notes as string | null,
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
  },

  /** Monthly assignment trends for chart (current year) */
  async getAssignmentTrends(year?: number): Promise<Array<{ month: string; count: number }>> {
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
  },
};

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

export const judgeAvailabilityQueries = {
  async upsert(data: JudgeAvailabilityUpsertData): Promise<DbJudgeAvailability> {
    const { data: availability, error } = await supabase
      .from('judge_availability')
      .upsert(data, { onConflict: 'person_id' })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to upsert judge availability: ${error.message}`);
    }

    return availability;
  },

  async getByPersonId(personId: string): Promise<DbJudgeAvailability | null> {
    const { data, error } = await supabase
      .from('judge_availability')
      .select('*')
      .eq('person_id', personId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch judge availability: ${error.message}`);
    }

    return data;
  },

  async delete(personId: string): Promise<void> {
    const { error } = await supabase.from('judge_availability').delete().eq('person_id', personId);

    if (error) {
      throw new Error(`Failed to delete judge availability: ${error.message}`);
    }
  },
};

export const judgeCertificationQueries = {
  async create(data: CreateJudgeCertificationDbData): Promise<Record<string, unknown>> {
    const { data: cert, error } = await certificationsTable().insert([data]).select().single();

    if (error) {
      throw new Error(`Failed to create judge certification: ${error.message}`);
    }

    return cert as Record<string, unknown>;
  },

  async getByPersonId(personId: string): Promise<Record<string, unknown>[]> {
    const { data, error } = await certificationsTable()
      .select('*')
      .eq('person_id', personId)
      .order('certification_date', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch judge certifications: ${error.message}`);
    }

    return (data || []) as Record<string, unknown>[];
  },
};
