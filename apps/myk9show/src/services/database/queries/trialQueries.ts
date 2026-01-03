// Database queries for Trial operations with soft delete support
import { supabase } from '../supabaseClient';
import type { Database } from '@/types/supabase';

type DbTrialInsert = Database['public']['Tables']['trial']['Insert'];
type DbTrialUpdate = Database['public']['Tables']['trial']['Update'];

// Get all trials (excluding soft-deleted)
export const getAllTrials = async () => {
  return await supabase
    .from('trial')
    .select(`
      *,
      show:show_id (
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
    .from('trial')
    .select(`
      *,
      show:show_id (
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
    .from('trial')
    .select(`
      *,
      show:show_id (
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
    .from('trial')
    .select(`
      *,
      show:show_id (
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
    .from('trial')
    .select(`
      *,
      show:show_id (
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
    .from('trial')
    .select(`
      *,
      show:show_id (
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
    .from('trial')
    .select(`
      *,
      show:show_id (
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
    .from('trial')
    .insert([trialData])
    .select()
    .single();
};

// Update a trial
export const updateTrial = async (id: string, updates: DbTrialUpdate) => {
  return await supabase
    .from('trial')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single();
};

// Soft delete a trial
export const deleteTrial = async (id: string, deletedBy?: string) => {
  return await supabase
    .from('trial')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: deletedBy || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .is('deleted_at', null);
};

// Hard delete a trial (permanent removal)
export const hardDeleteTrial = async (id: string) => {
  return await supabase
    .from('trial')
    .delete()
    .eq('id', id);
};

// Restore a soft-deleted trial
export const restoreTrial = async (id: string, restoredBy?: string) => {
  return await supabase
    .from('trial')
    .update({
      deleted_at: null,
      deleted_by: null,
      updated_at: new Date().toISOString(),
      updated_by: restoredBy || null,
    })
    .eq('id', id)
    .not('deleted_at', 'is', null)
    .select()
    .single();
};

// Get soft-deleted trials (admin only)
export const getDeletedTrials = async () => {
  return await supabase
    .from('trial')
    .select(`
      *,
      show:show_id (
        id,
        name,
        start_date,
        end_date
      ),
      deleted_by_user:user!deleted_by(
        id,
        first_name,
        last_name,
        email
      )
    `)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });
};

// Get trial statistics
export const getTrialStatistics = async () => {
  const totalQuery = supabase
    .from('trial')
    .select('id', { count: 'exact' })
    .is('deleted_at', null);

  const deletedQuery = supabase
    .from('trial')
    .select('id', { count: 'exact' })
    .not('deleted_at', 'is', null);

  const statusQuery = supabase
    .from('trial')
    .select('status')
    .is('deleted_at', null);

  const [totalResult, deletedResult, statusResult] = await Promise.all([
    totalQuery,
    deletedQuery,
    statusQuery,
  ]);

  if (totalResult.error || deletedResult.error || statusResult.error) {
    return {
      data: null,
      error: totalResult.error || deletedResult.error || statusResult.error,
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
      deleted: deletedResult.count || 0,
      active: (totalResult.count || 0) - (deletedResult.count || 0),
      byStatus: statusCounts,
    },
    error: null,
  };
};