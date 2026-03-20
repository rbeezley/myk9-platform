// Database queries for Trial operations with soft delete support
import { supabase } from '../supabaseClient';
import type { Database } from '@/types/supabase';

type DbTrialInsert = Database['public']['Tables']['trials']['Insert'];
type DbTrialUpdate = Database['public']['Tables']['trials']['Update'];

// Get all trials (excluding soft-deleted)
export const getAllTrials = async () => {
  return await supabase
    .from('trials')
    .select(`
      *,
      show:shows (
        id,
        name,
        start_date,
        end_date
      )
    `)
    .is('deleted_at', null)
    .order('date', { ascending: true });
};

// Get trial by ID (excluding soft-deleted)
export const getTrialById = async (id: string) => {
  return await supabase
    .from('trials')
    .select(`
      *,
      show:shows (
        id,
        name,
        start_date,
        end_date
      )
    `)
    .eq('id', id)
    .is('deleted_at', null)
    .single();
};

// Get trials by show ID (excluding soft-deleted)
export const getTrialsByShow = async (showId: string) => {
  return await supabase
    .from('trials')
    .select(`
      *,
      show:shows (
        id,
        name,
        start_date,
        end_date
      )
    `)
    .eq('show_id', showId)
    .is('deleted_at', null)
    .order('date', { ascending: true });
};

// Search trials by name (excluding soft-deleted)
export const searchTrials = async (searchTerm: string) => {
  return await supabase
    .from('trials')
    .select(`
      *,
      show:shows (
        id,
        name,
        start_date,
        end_date
      )
    `)
    .ilike('name', `%${searchTerm}%`)
    .is('deleted_at', null)
    .order('date', { ascending: true });
};

// Get trials by status (excluding soft-deleted)
export const getTrialsByStatus = async (status: string) => {
  return await supabase
    .from('trials')
    .select(`
      *,
      show:shows (
        id,
        name,
        start_date,
        end_date
      )
    `)
    .eq('status', status)
    .is('deleted_at', null)
    .order('date', { ascending: true });
};

// Get upcoming trials (excluding soft-deleted)
export const getUpcomingTrials = async (limit?: number) => {
  const today = new Date().toISOString().split('T')[0];

  let query = supabase
    .from('trials')
    .select(`
      *,
      show:shows (
        id,
        name,
        start_date,
        end_date
      )
    `)
    .gte('date', today)
    .is('deleted_at', null)
    .order('date', { ascending: true });

  if (limit) {
    query = query.limit(limit);
  }

  return await query;
};

// Get trials by date range (excluding soft-deleted)
export const getTrialsByDateRange = async (startDate: string, endDate: string) => {
  return await supabase
    .from('trials')
    .select(`
      *,
      show:shows (
        id,
        name,
        start_date,
        end_date
      )
    `)
    .gte('date', startDate)
    .lte('date', endDate)
    .is('deleted_at', null)
    .order('date', { ascending: true });
};

// Create a new trial
export const createTrial = async (trialData: DbTrialInsert) => {
  return await supabase
    .from('trials')
    .insert([trialData])
    .select()
    .single();
};

// Update a trial
export const updateTrial = async (id: string, updates: DbTrialUpdate) => {
  return await supabase
    .from('trials')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
        .select()
    .single();
};

// Soft delete a trial
export const deleteTrial = async (id: string, deletedBy?: string) => {
  const updateData: Record<string, unknown> = {
    deleted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (deletedBy) {
    updateData.deleted_by = deletedBy;
  }

  return await supabase
    .from('trials')
    .update(updateData)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id, name')
    .single();
};

// Hard delete a trial (permanent removal)
export const hardDeleteTrial = async (id: string) => {
  return await supabase
    .from('trials')
    .delete()
    .eq('id', id);
};

// Restore a soft-deleted trial (admin only)
export const restoreTrial = async (id: string, restoredBy?: string) => {
  const updateData: Record<string, unknown> = {
    deleted_at: null,
    deleted_by: null,
    updated_at: new Date().toISOString(),
  };

  if (restoredBy) {
    updateData.updated_by = restoredBy;
  }

  return await supabase
    .from('trials')
    .update(updateData)
    .eq('id', id)
    .select('id, name')
    .single();
};

// Get soft-deleted trials (admin only)
export const getDeletedTrials = async () => {
  return await supabase
    .from('trials')
    .select(`
      *,
      show:shows (id, name),
      deleted_by_user:deleted_by (id, first_name, last_name, email)
    `)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });
};

// Get trial statistics (excluding soft-deleted)
export const getTrialStatistics = async () => {
  const totalQuery = supabase
    .from('trials')
    .select('id', { count: 'exact' })
    .is('deleted_at', null);

  const statusQuery = supabase
    .from('trials')
    .select('status')
    .is('deleted_at', null);

  const [totalResult, statusResult] = await Promise.all([
    totalQuery,
    statusQuery,
  ]);

  if (totalResult.error || statusResult.error) {
    return {
      data: null,
      error: totalResult.error || statusResult.error,
    };
  }

  const statusCounts = statusResult.data?.reduce((acc: Record<string, number>, trial: { status?: string | null }) => {
    const status = trial.status || 'Unknown';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  return {
    data: {
      total: totalResult.count || 0,
      byStatus: statusCounts,
    },
    error: null,
  };
};