// Judge assignment database queries
import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import type { ShowJudgeAssignment } from '@/types/judge-types';

export interface DbJudgeAssignment {
  id: string;
  show_id: string;
  judge_id: string;
  assignment_type: string;
  assigned_classes: string[] | null;
  assigned_rings: string[] | null;
  assignment_date: string;
  assignment_status: string;
  compensation_amount: number | null;
  expenses_covered: boolean;
  travel_provided: boolean;
  special_requirements: string | null;
  notes: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Get all judge assignments for a show
 */
export const getJudgeAssignmentsByShow = async (showId: string) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('judge_assignment')
      .select(`
        *,
        judge:user(
          id,
          first_name,
          last_name,
          email
        )
      `)
      .eq('show_id', showId)
      .eq('assignment_type', 'judge') // Only get judge assignments, not stewards
      .order('assignment_date', { ascending: true });
    
    const duration = Date.now() - startTime;
    logQuery('judge_assignment', 'select_by_show', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'judge_assignment', 'select_by_show');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'judge_assignment', 'select_by_show');
    logQuery('judge_assignment', 'select_by_show', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Create or update judge assignments for a show
 */
export const upsertJudgeAssignments = async (showId: string, judgeAssignments: ShowJudgeAssignment[]) => {
  const startTime = Date.now();
  
  try {
    // First, get existing judge assignments for this show
    const { data: existing } = await supabase
      .from('judge_assignment')
      .select('id, judge_id')
      .eq('show_id', showId)
      .eq('assignment_type', 'judge');

    const existingJudgeIds = new Set((existing || []).map(a => a.judge_id));
    const newJudgeIds = new Set(judgeAssignments.map(ja => ja.judgeId));

    // Prepare insertions for new judges
    const toInsert = judgeAssignments
      .filter(ja => !existingJudgeIds.has(ja.judgeId))
      .map(ja => ({
        show_id: showId,
        judge_id: ja.judgeId,
        assignment_type: 'judge' as const,
        assigned_classes: null, // Will be set later when assigning to specific classes
        assigned_rings: null,
        assignment_date: ja.assignedDate,
        assignment_status: 'confirmed' as const,
        compensation_amount: null,
        expenses_covered: false,
        travel_provided: false,
        special_requirements: [
          ja.availableStartTime !== 'Full Day' ? `Available: ${ja.availableStartTime}` : null,
          ja.availableEndTime !== 'Full Day' ? `Until: ${ja.availableEndTime}` : null
        ].filter(Boolean).join(', ') || null,
        notes: null,
        confirmed_by: null,
        confirmed_at: null
      }));

    // Find judges to remove (existed before but not in new list)
    const toRemove = (existing || [])
      .filter(e => !newJudgeIds.has(e.judge_id!))
      .map(e => e.id);

    // Execute operations
    const operations = [];

    if (toInsert.length > 0) {
      operations.push(
        supabase
          .from('judge_assignment')
          .insert(toInsert)
      );
    }

    if (toRemove.length > 0) {
      operations.push(
        supabase
          .from('judge_assignment')
          .delete()
          .in('id', toRemove)
      );
    }

    // Execute all operations
    const results = await Promise.all(operations);
    
    // Check for errors
    for (const result of results) {
      if (result.error) {
        throw createDatabaseError(result.error, 'judge_assignment', 'upsert');
      }
    }

    const duration = Date.now() - startTime;
    logQuery('judge_assignment', 'upsert', duration);
    
    return { data: { inserted: toInsert.length, removed: toRemove.length }, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'judge_assignment', 'upsert');
    logQuery('judge_assignment', 'upsert', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Remove all judge assignments for a show
 */
export const removeJudgeAssignmentsByShow = async (showId: string) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('judge_assignment')
      .delete()
      .eq('show_id', showId)
      .eq('assignment_type', 'judge')
      .select('id');
    
    const duration = Date.now() - startTime;
    logQuery('judge_assignment', 'delete_by_show', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'judge_assignment', 'delete_by_show');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'judge_assignment', 'delete_by_show');
    logQuery('judge_assignment', 'delete_by_show', duration, dbError.message);
    return { data: [], error: dbError };
  }
};