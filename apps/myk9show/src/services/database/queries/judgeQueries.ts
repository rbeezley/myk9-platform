/**
 * Judge Management Database Queries
 * 
 * Comprehensive database operations for judge qualifications and assignments
 * supporting multiple organizations and performance tracking.
 */

import { supabase } from '../supabaseClient';
import {
  JudgeQualification,
  JudgeAssignment,
  JudgeCertification,
  CreateJudgeQualificationData,
  UpdateJudgeQualificationData,
  CreateJudgeAssignmentData,
  UpdateJudgeAssignmentData,
  CreateJudgeCertificationData,
  UpdateJudgeCertificationData,
  JudgeQualificationFilters,
  JudgeAssignmentFilters,
  JudgeCertificationFilters,
  JudgeQualificationSummary,
  JudgeAssignmentSummary,
  JudgeCertificationSummary,
  JudgePerformanceStats
} from '../../../types/judge-management';
import { DbJudgeCertification } from '../../../types/database-mappings';

// Judge Qualification Operations
export const judgeQualificationQueries = {
  // Create new judge qualification
  async create(data: CreateJudgeQualificationData): Promise<JudgeQualification> {
    const { data: qualification, error } = await supabase
      .from('judge_qualification')
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
    const { data: qualification, error } = await supabase
      .from('judge_qualification')
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
  async getByJudgeId(judgeId: string, filters?: JudgeQualificationFilters): Promise<JudgeQualification[]> {
    let query = supabase
      .from('judge_qualification')
      .select('*')
      .eq('person_id', judgeId);

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
    
    const { data: qualification, error } = await supabase
      .from('judge_qualification')
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
    const { error } = await supabase
      .from('judge_qualification')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete judge qualification: ${error.message}`);
    }
  },

  // Suspend qualification
  async suspend(id: string, reason: string): Promise<JudgeQualification> {
    const { data: qualification, error } = await supabase
      .from('judge_qualification')
      .update({
        suspension_date: new Date().toISOString(),
        suspension_reason: reason,
        is_active: false,
        updated_at: new Date().toISOString()
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
    const { data: qualification, error } = await supabase
      .from('judge_qualification')
      .update({
        suspension_date: null,
        suspension_reason: null,
        is_active: true,
        updated_at: new Date().toISOString()
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
    const expiredQualifications = qualifications.filter(q => 
      q.expiration_date && new Date(q.expiration_date) < new Date()
    );
    const suspendedQualifications = qualifications.filter(q => q.suspension_date);
    
    // Check for expiring qualifications (within 30 days)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const expiringSoon = qualifications.filter(q => 
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
      qualifications_by_level: {}
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
};

// Judge Assignment Operations
export const judgeAssignmentQueries = {
  // Create new judge assignment
  async create(data: CreateJudgeAssignmentData): Promise<JudgeAssignment> {
    const { data: assignment, error } = await supabase
      .from('judge_assignment')
      .insert([{ ...data, assignment_status: data.assignment_status || 'Requested' }])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create judge assignment: ${error.message}`);
    }

    return assignment as unknown as JudgeAssignment;
  },

  // Get assignment by ID
  async getById(id: string): Promise<JudgeAssignment | null> {
    const { data: assignment, error } = await supabase
      .from('judge_assignment')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Failed to fetch judge assignment: ${error.message}`);
    }

    return assignment as unknown as JudgeAssignment;
  },

  // Get all assignments for a judge
  async getByJudgeId(judgeId: string, filters?: JudgeAssignmentFilters): Promise<JudgeAssignment[]> {
    let query = supabase
      .from('judge_assignment')
      .select('*')
      .eq('judge_id', judgeId);

    // Apply filters
    if (filters?.show_id) {
      query = query.eq('show_id', filters.show_id);
    }
    if (filters?.assignment_type) {
      query = query.eq('assignment_type', filters.assignment_type);
    }
    if (filters?.assignment_status) {
      query = query.eq('assignment_status', filters.assignment_status);
    }
    if (filters?.assignment_date_from) {
      query = query.gte('assignment_date', filters.assignment_date_from);
    }
    if (filters?.assignment_date_to) {
      query = query.lte('assignment_date', filters.assignment_date_to);
    }
    if (filters?.confirmed !== undefined) {
      if (filters.confirmed) {
        query = query.not('confirmed_at', 'is', null);
      } else {
        query = query.is('confirmed_at', null);
      }
    }

    query = query.order('assignment_date', { ascending: false });

    const { data: assignments, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch judge assignments: ${error.message}`);
    }

    return (assignments || []) as unknown as JudgeAssignment[];
  },

  // Get assignments for a show
  async getByShowId(showId: string, filters?: Omit<JudgeAssignmentFilters, 'show_id'>): Promise<JudgeAssignment[]> {
    let query = supabase
      .from('judge_assignment')
      .select('*')
      .eq('show_id', showId);

    // Apply filters (excluding show_id)
    if (filters?.assignment_type) {
      query = query.eq('assignment_type', filters.assignment_type);
    }
    if (filters?.assignment_status) {
      query = query.eq('assignment_status', filters.assignment_status);
    }
    if (filters?.confirmed !== undefined) {
      if (filters.confirmed) {
        query = query.not('confirmed_at', 'is', null);
      } else {
        query = query.is('confirmed_at', null);
      }
    }

    query = query.order('assignment_date', { ascending: true });

    const { data: assignments, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch show assignments: ${error.message}`);
    }

    return (assignments || []) as unknown as JudgeAssignment[];
  },

  // Update assignment
  async update(data: UpdateJudgeAssignmentData): Promise<JudgeAssignment> {
    const { id, ...updateData } = data;
    
    const { data: assignment, error } = await supabase
      .from('judge_assignment')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update judge assignment: ${error.message}`);
    }

    return assignment as unknown as JudgeAssignment;
  },

  // Confirm assignment
  async confirm(id: string, confirmedBy: string): Promise<JudgeAssignment> {
    const { data: assignment, error } = await supabase
      .from('judge_assignment')
      .update({
        assignment_status: 'Confirmed',
        confirmed_at: new Date().toISOString(),
        confirmed_by: confirmedBy,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to confirm judge assignment: ${error.message}`);
    }

    return assignment as unknown as JudgeAssignment;
  },

  // Delete assignment
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('judge_assignment')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete judge assignment: ${error.message}`);
    }
  },

  // Get assignment summary for a judge
  async getSummary(judgeId: string): Promise<JudgeAssignmentSummary> {
    const assignments = await this.getByJudgeId(judgeId);
    
    const now = new Date();
    const upcomingAssignments = assignments.filter(a => new Date(a.assignment_date) >= now);
    const completedAssignments = assignments.filter(a => a.assignment_status === 'Completed');
    const confirmedAssignments = assignments.filter(a => a.confirmed_at);
    const pendingAssignments = assignments.filter(a => 
      !a.confirmed_at && 
      ['Requested', 'Offered', 'Accepted'].includes(a.assignment_status || '')
    );

    const totalCompensation = assignments.reduce((sum, a) => sum + (a.compensation_amount || 0), 0);
    const uniqueShows = [...new Set(assignments.map(a => a.show_id).filter(Boolean))];

    const summary: JudgeAssignmentSummary = {
      total_assignments: assignments.length,
      upcoming_assignments: upcomingAssignments.length,
      completed_assignments: completedAssignments.length,
      confirmed_assignments: confirmedAssignments.length,
      pending_assignments: pendingAssignments.length,
      shows_judged: uniqueShows as string[],
      assignment_types: [...new Set(assignments.map(a => a.assignment_type))] as string[],
      total_compensation: totalCompensation,
      recent_assignments: assignments.slice(0, 5), // Last 5 assignments
      assignments_by_type: {},
      assignments_by_status: {}
    };

    // Calculate distributions
    assignments.forEach(assignment => {
      summary.assignments_by_type[assignment.assignment_type] = 
        (summary.assignments_by_type[assignment.assignment_type] || 0) + 1;
      
      const status = assignment.assignment_status || 'Unknown';
      summary.assignments_by_status[status] = 
        (summary.assignments_by_status[status] || 0) + 1;
    });

    return summary;
  }
};

// Judge Certification Operations
export const judgeCertificationQueries = {
  // Create new judge certification
  async create(data: CreateJudgeCertificationData): Promise<JudgeCertification> {
    const { data: certification, error } = await supabase
      .from('judge_certification')
      .insert([{ 
        ...data, 
        is_active: data.is_active ?? true,
        renewal_required: data.renewal_required ?? false,
        continuing_education_hours: data.continuing_education_hours ?? 0
      }])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create judge certification: ${error.message}`);
    }

    return certification as unknown as JudgeCertification;
  },

  // Get certification by ID
  async getById(id: string): Promise<JudgeCertification | null> {
    const { data: certification, error } = await supabase
      .from('judge_certification')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Failed to fetch judge certification: ${error.message}`);
    }

    return certification as unknown as JudgeCertification;
  },

  // Get all certifications for a judge
  async getByJudgeId(judgeId: string, filters?: JudgeCertificationFilters): Promise<JudgeCertification[]> {
    let query = supabase
      .from('judge_certification')
      .select('*')
      .eq('person_id', judgeId);

    // Apply filters
    if (filters?.issuing_body) {
      query = query.eq('issuing_body', filters.issuing_body);
    }
    if (filters?.certification_name) {
      query = query.ilike('certification_name', `%${filters.certification_name}%`);
    }
    if (filters?.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }
    if (filters?.renewal_required !== undefined) {
      query = query.eq('renewal_required', filters.renewal_required);
    }
    if (filters?.expiring_within_days) {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + filters.expiring_within_days);
      query = query
        .not('expiration_date', 'is', null)
        .lte('expiration_date', futureDate.toISOString().split('T')[0]);
    }

    query = query.order('date_obtained', { ascending: false });

    const { data: certifications, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch judge certifications: ${error.message}`);
    }

    return (certifications || []) as unknown as JudgeCertification[];
  },

  // Update certification
  async update(data: UpdateJudgeCertificationData): Promise<JudgeCertification> {
    const { id, ...updateData } = data;
    
    const { data: certification, error } = await supabase
      .from('judge_certification')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update judge certification: ${error.message}`);
    }

    return certification as unknown as JudgeCertification;
  },

  // Delete certification
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('judge_certification')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete judge certification: ${error.message}`);
    }
  },

  // Renew certification
  async renew(id: string, newExpirationDate: string, continuingEducationHours?: number): Promise<JudgeCertification> {
    const updateData: Partial<DbJudgeCertification> = {
      expiration_date: newExpirationDate,
      updated_at: new Date().toISOString()
    };

    if (continuingEducationHours !== undefined) {
      updateData.continuing_education_hours = continuingEducationHours;
    }

    // Calculate next renewal date if renewal required
    const certification = await this.getById(id);
    if (certification?.renewal_required) {
      const expirationDate = new Date(newExpirationDate);
      expirationDate.setFullYear(expirationDate.getFullYear() + 2); // Default 2 year renewal cycle
      updateData.next_renewal_date = expirationDate.toISOString().split('T')[0];
    }

    const { data: updatedCertification, error } = await supabase
      .from('judge_certification')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to renew judge certification: ${error.message}`);
    }

    return updatedCertification as unknown as JudgeCertification;
  },

  // Get certification summary for a judge
  async getSummary(judgeId: string): Promise<JudgeCertificationSummary> {
    const certifications = await this.getByJudgeId(judgeId);
    
    const activeCertifications = certifications.filter(c => c.is_active);
    const expiredCertifications = certifications.filter(c => 
      c.expiration_date && new Date(c.expiration_date) < new Date()
    );
    const renewalRequired = certifications.filter(c => c.renewal_required);
    
    // Check for expiring certifications (within 30 days)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const expiringSoon = certifications.filter(c => 
      c.expiration_date && 
      new Date(c.expiration_date) <= thirtyDaysFromNow &&
      new Date(c.expiration_date) >= new Date()
    );

    const totalContinuingEducation = certifications.reduce(
      (sum, c) => sum + c.continuing_education_hours, 0
    );

    const summary: JudgeCertificationSummary = {
      total_certifications: certifications.length,
      active_certifications: activeCertifications.length,
      expired_certifications: expiredCertifications.length,
      expiring_soon: expiringSoon.length,
      renewal_required: renewalRequired.length,
      continuing_education_total: totalContinuingEducation,
      issuing_bodies: [...new Set(certifications.map(c => c.issuing_body))] as string[],
      certification_types: [...new Set(certifications.map(c => c.certification_name))] as string[],
      latest_certification: certifications[0], // Already sorted by date desc
      certifications_by_body: {},
      certifications_by_type: {}
    };

    // Calculate distributions
    certifications.forEach(certification => {
      summary.certifications_by_body[certification.issuing_body] = 
        (summary.certifications_by_body[certification.issuing_body] || 0) + 1;
      
      summary.certifications_by_type[certification.certification_name] = 
        (summary.certifications_by_type[certification.certification_name] || 0) + 1;
    });

    return summary;
  }
};

// Combined Analytics Operations
export const judgePerformanceQueries = {
  // Get comprehensive performance stats for a judge
  async getPerformanceStats(judgeId: string): Promise<JudgePerformanceStats> {
    const [qualificationSummary, assignmentSummary, certificationSummary] = await Promise.all([
      judgeQualificationQueries.getSummary(judgeId),
      judgeAssignmentQueries.getSummary(judgeId),
      judgeCertificationQueries.getSummary(judgeId)
    ]);

    // Get performance trend data (last 12 months)
    const assignments = await judgeAssignmentQueries.getByJudgeId(judgeId, {
      assignment_date_from: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    });

    const activityTrend = this.calculateActivityTrend(assignments);
    const careerHighlights = await this.getCareerHighlights(judgeId);

    return {
      qualification_summary: qualificationSummary,
      assignment_summary: assignmentSummary,
      certification_summary: certificationSummary,
      career_highlights: careerHighlights,
      activity_trend: activityTrend
    };
  },

  // Calculate monthly activity trend
  calculateActivityTrend(assignments: JudgeAssignment[]) {
    const monthlyStats: Record<string, { assignments: number; shows: number; compensation: number }> = {};
    
    assignments.forEach(assignment => {
      const month = assignment.assignment_date.substring(0, 7); // YYYY-MM
      
      if (!monthlyStats[month]) {
        monthlyStats[month] = { assignments: 0, shows: 0, compensation: 0 };
      }
      
      monthlyStats[month].assignments++;
      if (assignment.show_id) {
        monthlyStats[month].shows++;
      }
      monthlyStats[month].compensation += assignment.compensation_amount || 0;
    });

    return Object.entries(monthlyStats)
      .map(([month, stats]) => ({ month, ...stats }))
      .sort((a, b) => a.month.localeCompare(b.month));
  },

  // Get career highlights
  async getCareerHighlights(judgeId: string) {
    const [qualifications, assignments, certifications] = await Promise.all([
      judgeQualificationQueries.getByJudgeId(judgeId),
      judgeAssignmentQueries.getByJudgeId(judgeId),
      judgeCertificationQueries.getByJudgeId(judgeId)
    ]);

    // Find first qualification (oldest by date)
    const firstQualification = qualifications
      .sort((a, b) => a.date_obtained.localeCompare(b.date_obtained))[0];
    
    // Find first certification (oldest by date)
    const firstCertification = certifications
      .sort((a, b) => a.date_obtained.localeCompare(b.date_obtained))[0];

    // Find highest compensation assignment
    const highestCompensationAssignment = assignments
      .filter(a => a.compensation_amount && a.compensation_amount > 0)
      .sort((a, b) => (b.compensation_amount || 0) - (a.compensation_amount || 0))[0];

    // Find most recent assignment
    const mostRecentAssignment = assignments
      .sort((a, b) => b.assignment_date.localeCompare(a.assignment_date))[0];

    // Calculate years active
    const firstYear = firstQualification ? new Date(firstQualification.date_obtained).getFullYear() : 0;
    const currentYear = new Date().getFullYear();
    const yearsActive = firstYear > 0 ? currentYear - firstYear : 0;

    // Calculate favorite disciplines from qualifications
    const disciplineCounts: Record<string, number> = {};
    qualifications.forEach(q => {
      q.disciplines.forEach(discipline => {
        disciplineCounts[discipline] = (disciplineCounts[discipline] || 0) + 1;
      });
    });
    
    const favoriteDisciplines = Object.entries(disciplineCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([discipline]) => discipline);

    return {
      first_qualification: firstQualification,
      first_certification: firstCertification,
      most_recent_assignment: mostRecentAssignment,
      highest_compensation_assignment: highestCompensationAssignment,
      total_shows_judged: [...new Set(assignments.map(a => a.show_id).filter(Boolean))].length,
      years_active: yearsActive,
      favorite_disciplines: favoriteDisciplines
    };
  }
};