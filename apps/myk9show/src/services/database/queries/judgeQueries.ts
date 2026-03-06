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
