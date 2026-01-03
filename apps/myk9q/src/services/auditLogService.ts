/**
 * Audit Log Service
 *
 * Provides functions to fetch and filter audit log entries from the unified
 * view_audit_log view which combines show, trial, and class level changes.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/utils/logger';

export interface AuditLogEntry {
  change_type: 'show_visibility' | 'trial_visibility' | 'class_visibility';
  scope: 'Show Level' | 'Trial Level' | 'Class Level';
  license_key: string;
  show_name: string;
  trial_id: number | null;
  trial_number: number | null;
  class_id: number | null;
  element: string | null;
  level: string | null;
  section: string | null;
  setting_category: 'visibility';
  setting_value: string;
  updated_by: string;
  updated_at: string;
}

export interface AuditLogFilters {
  scope?: 'Show Level' | 'Trial Level' | 'Class Level';
  setting_category?: 'visibility';
  updated_by?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Fetch audit log entries for a specific show/license key
 */
export async function fetchAuditLog(
  licenseKey: string,
  filters?: AuditLogFilters,
  limit: number = 100
): Promise<AuditLogEntry[]> {
  try {
    let query = supabase
      .from('view_audit_log')
      .select('*')
      .eq('license_key', licenseKey)
      .order('updated_at', { ascending: false })
      .limit(limit);

    // Apply filters
    if (filters?.scope) {
      query = query.eq('scope', filters.scope);
    }

    if (filters?.setting_category) {
      query = query.eq('setting_category', filters.setting_category);
    }

    if (filters?.updated_by) {
      query = query.ilike('updated_by', `%${filters.updated_by}%`);
    }

    if (filters?.startDate) {
      query = query.gte('updated_at', filters.startDate);
    }

    if (filters?.endDate) {
      query = query.lte('updated_at', filters.endDate);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Error fetching audit log:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    logger.error('Error in fetchAuditLog:', error);
    throw error;
  }
}

/**
 * Get list of unique administrators who have made changes
 */
export async function getUniqueAdministrators(licenseKey: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('view_audit_log')
      .select('updated_by')
      .eq('license_key', licenseKey)
      .not('updated_by', 'is', null);

    if (error) {
      logger.error('Error fetching administrators:', error);
      throw error;
    }

    // Get unique values
    const uniqueAdmins = [...new Set(data?.map(entry => entry.updated_by) || [])];
    return uniqueAdmins.sort();
  } catch (error) {
    logger.error('Error in getUniqueAdministrators:', error);
    throw error;
  }
}

/**
 * Format audit log entry for display
 */
export function formatAuditEntry(entry: AuditLogEntry): string {
  const parts: string[] = [];

  if (entry.scope === 'Show Level') {
    parts.push('Show-wide');
  } else if (entry.scope === 'Trial Level') {
    parts.push(`Trial ${entry.trial_number}`);
  } else if (entry.scope === 'Class Level') {
    parts.push(`${entry.element} ${entry.level} ${entry.section}`);
  }

  parts.push(`→ ${entry.setting_value}`);

  return parts.join(' ');
}
